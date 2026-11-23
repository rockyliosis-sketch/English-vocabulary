#!/usr/bin/env node
/**
 * Turn word files waiting in data/inbox/ into D1 statements.
 *
 * This script never connects to Cloudflare. It only reads local files and writes
 * SQL / JSON next to them, so any agent can run it. An agent that can write to
 * english-vocab-db then runs the output (see docs/word-intake-rules.md §7).
 *
 * D1 read budget (docs/word-intake-rules.md §6): every statement it emits is a
 * single-row INSERT ... ON CONFLICT(id) DO NOTHING (about 2 rows read each) or one
 * primary-key lookup (WHERE id IN (...) LIMIT n, about 1 row read per id).
 * No scans, no recursive CTEs, no per-character SQL. All text normalization and
 * duplicate checks happen here in JavaScript.
 *
 * Usage:
 *   node scripts/import-inbox.mjs [--inbox data/inbox] [--snapshot words.json]
 *                                 [--out data/inbox/out] [--check]
 *
 *   --snapshot  Optional local copy of the library (array of rows, {words:[...]},
 *               or a D1 query result). Used to catch an id that already exists and
 *               examples that repeat another card. Strongly recommended.
 *   --check     Validate only; write nothing.
 *
 * Output (unless --check), in --out (default data/inbox/out/, git-ignored):
 *   insert.sql   one INSERT ... ON CONFLICT(id) DO NOTHING per word (wrangler --file)
 *   verify.sql   one primary-key SELECT for all ids (wrangler --command)
 *   api.json     [{sql, params}] for the Cloudflare D1 query API / connector
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const POS_CODES = Object.freeze(['n', 'v', 'adj', 'adv', 'phrase', 'prep', 'conj', 'pron', 'interj', 'det', 'num']);
export const ID_RE = new RegExp(`^[a-z0-9]+(?:-[a-z0-9]+)*-(?:${POS_CODES.join('|')})-[1-9]\\d*$`);
const ADDED_AT_RE = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2})?\+08:00$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RELATED_FIELDS = ['english', 'ipa', 'pos', 'zh', 'relation'];

export const COLUMNS = Object.freeze([
  'id', 'english', 'ipa', 'pos', 'chinese_sense',
  'original_context', 'usage_notes', 'examples_json', 'related_words_json',
  'added_at', 'stage', 'next_review_date', 'last_feedback', 'last_feedback_at', 'paused'
]);

/** Same comparison as functions/_lib/scheduler.js normalizeExampleText. */
export function normalizeText(value) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/gu, ' ').toLowerCase().replace(/[\p{P}\s]+$/gu, '')
    : '';
}

/** Next calendar day after the +08:00 date part of added_at. */
export function nextDay(addedAt) {
  const m = ADDED_AT_RE.exec(addedAt);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
  return d.toISOString().slice(0, 10);
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const v = JSON.parse(value); return Array.isArray(v) ? v : null; } catch { return null; }
  }
  return null;
}

/** Accepts words.json backups, plain row arrays, or D1 query results. */
export function loadSnapshotRows(raw) {
  if (Array.isArray(raw)) {
    if (raw.length && raw[0] && Array.isArray(raw[0].results)) return raw.flatMap((r) => r.results);
    return raw;
  }
  if (raw && Array.isArray(raw.words)) return raw.words;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && raw.result) return loadSnapshotRows(raw.result);
  throw new Error('snapshot: unrecognised format');
}

function snapshotTexts(row) {
  // D1 rows carry examples_json; the Grok Bot words.json backup uses examples,
  // and its oldest cards use example + examples_extra instead.
  const list = [
    ...(asList(row.examples_json) || asList(row.examples) || []),
    ...(row.example && typeof row.example === 'object' ? [row.example] : []),
    ...(asList(row.examples_extra) || [])
  ];
  const texts = list.map((e) => (e && typeof e === 'object' ? e.en : null)).filter(Boolean);
  if (row.original_context) texts.push(row.original_context);
  return texts;
}

/** Validates one inbox entry. Returns a list of problems (empty = ok). */
export function validateEntry(entry) {
  const errs = [];
  const str = (k) => typeof entry[k] === 'string' && entry[k].trim() !== '';
  for (const k of ['id', 'english', 'ipa', 'pos', 'chinese_sense', 'added_at', 'next_review_date']) {
    if (!str(k)) errs.push(`${k} is required`);
  }
  if (str('id') && !ID_RE.test(entry.id)) errs.push(`id "${entry.id}" does not match <english>-<pos code>-<n> (codes: ${POS_CODES.join(', ')})`);
  if (str('ipa') && !/^\/.+\/$/.test(entry.ipa)) errs.push('ipa must be wrapped in slashes, e.g. /ˈvælɪd/');
  if (str('added_at') && !ADDED_AT_RE.test(entry.added_at)) errs.push('added_at must be ISO 8601 with +08:00, e.g. 2026-11-17T18:47:29+08:00');
  if (str('added_at') && str('next_review_date')) {
    if (!DATE_RE.test(entry.next_review_date)) errs.push('next_review_date must be YYYY-MM-DD');
    else if (nextDay(entry.added_at) !== entry.next_review_date) errs.push(`next_review_date must be the day after added_at (${nextDay(entry.added_at)})`);
  }
  if (entry.original_context !== null && entry.original_context !== undefined && typeof entry.original_context !== 'string') {
    errs.push('original_context must be a string or null');
  }
  if (typeof entry.original_context === 'string' && entry.original_context.trim() === '') errs.push('original_context: use null, not an empty string');
  if (entry.usage_notes !== null && entry.usage_notes !== undefined && typeof entry.usage_notes !== 'string') errs.push('usage_notes must be a string or null');
  if ((entry.stage ?? 0) !== 0) errs.push('stage must be 0 for a new card');
  if ((entry.paused ?? 0) !== 0) errs.push('paused must be 0');
  if (entry.last_feedback != null || entry.last_feedback_at != null) errs.push('last_feedback / last_feedback_at must be null');

  const examples = asList(entry.examples_json);
  if (!examples) errs.push('examples_json must be an array of {en, zh}');
  else {
    if (examples.length < 3 || examples.length > 5) errs.push(`examples_json needs 3–5 items, got ${examples.length}`);
    const seen = new Set();
    const ctx = normalizeText(entry.original_context);
    examples.forEach((e, i) => {
      if (!e || typeof e.en !== 'string' || !e.en.trim() || typeof e.zh !== 'string' || !e.zh.trim()) errs.push(`examples_json[${i}] needs non-empty en and zh`);
      const n = normalizeText(e && e.en);
      if (n && seen.has(n)) errs.push(`examples_json[${i}] repeats another example of this card`);
      if (n && ctx && n === ctx) errs.push(`examples_json[${i}] repeats original_context`);
      seen.add(n);
    });
  }
  const related = entry.related_words_json === undefined ? [] : asList(entry.related_words_json);
  if (!related) errs.push('related_words_json must be an array');
  else related.forEach((r, i) => {
    if (!r || RELATED_FIELDS.some((k) => typeof r[k] !== 'string' || !r[k].trim())) errs.push(`related_words_json[${i}] needs ${RELATED_FIELDS.join(', ')}`);
  });
  return errs;
}

/** Cross-checks entries against each other and the snapshot. */
export function crossCheck(entries, snapshotRows = []) {
  const problems = [];
  const existingIds = new Set(snapshotRows.map((r) => r.id));
  const owner = new Map();
  for (const row of snapshotRows) for (const t of snapshotTexts(row)) owner.set(normalizeText(t), `library:${row.id}`);
  const ids = new Set();
  for (const { file, entry } of entries) {
    if (ids.has(entry.id)) problems.push(`${file}: id ${entry.id} appears twice in the inbox`);
    ids.add(entry.id);
    if (existingIds.has(entry.id)) problems.push(`${file}: id ${entry.id} already exists in the library — same word + same sense means merge notes only (docs §4), not a new card`);
    for (const e of asList(entry.examples_json) || []) {
      const n = normalizeText(e && e.en);
      if (n && owner.has(n) && owner.get(n) !== `inbox:${entry.id}`) problems.push(`${file}: example "${e.en}" already used by ${owner.get(n)}`);
    }
    for (const e of asList(entry.examples_json) || []) {
      const n = normalizeText(e && e.en);
      if (n) owner.set(n, `inbox:${entry.id}`);
    }
    if (entry.original_context) {
      const n = normalizeText(entry.original_context);
      if (!owner.has(n)) owner.set(n, `inbox:${entry.id}`);
    }
  }
  return problems;
}

/** Row values in COLUMNS order, JSON columns serialised. */
export function rowValues(entry) {
  const related = entry.related_words_json === undefined ? [] : asList(entry.related_words_json);
  const v = {
    ...entry,
    original_context: entry.original_context ?? null,
    usage_notes: entry.usage_notes ?? null,
    examples_json: JSON.stringify(asList(entry.examples_json).map(({ en, zh }) => ({ en: en.trim(), zh: zh.trim() }))),
    related_words_json: JSON.stringify(related.map((r) => Object.fromEntries(RELATED_FIELDS.map((k) => [k, r[k].trim()])))),
    stage: 0,
    last_feedback: null,
    last_feedback_at: null,
    paused: 0
  };
  return COLUMNS.map((c) => v[c]);
}

export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (/\u0000/.test(value)) throw new Error('NUL character in value');
  return `'${String(value).replace(/'/g, "''")}'`;
}

export const INSERT_SQL = `INSERT INTO words (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((_, i) => `?${i + 1}`).join(', ')}) ON CONFLICT(id) DO NOTHING`;

export function insertStatement(entry) {
  return `INSERT INTO words (${COLUMNS.join(', ')})\nVALUES (${rowValues(entry).map(sqlLiteral).join(', ')})\nON CONFLICT(id) DO NOTHING;`;
}

export function verifySql(ids) {
  return `SELECT id, english, stage, next_review_date, paused FROM words WHERE id IN (${ids.map(sqlLiteral).join(', ')}) LIMIT ${ids.length};`;
}

export function buildOutputs(entries) {
  const ids = entries.map((e) => e.id);
  return {
    insertSql: `-- Generated by scripts/import-inbox.mjs. One row per statement; ON CONFLICT keeps existing cards untouched.\n` +
      entries.map(insertStatement).join('\n\n') + '\n',
    verifySql: verifySql(ids),
    api: [
      ...entries.map((e) => ({ sql: INSERT_SQL, params: rowValues(e) })),
      { sql: `SELECT id, english, stage, next_review_date, paused FROM words WHERE id IN (${ids.map((_, i) => `?${i + 1}`).join(', ')}) LIMIT ${ids.length}`, params: ids }
    ],
    estimate: { rows_read: entries.length * 2 + ids.length, rows_written: entries.length * 3 }
  };
}

export function readInbox(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const full = path.join(dir, f);
      let entry;
      try { entry = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (err) { throw new Error(`${f}: invalid JSON (${err.message})`); }
      return { file: f, entry };
    });
}

function main(argv) {
  const args = { inbox: 'data/inbox', out: null, snapshot: null, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check') args.check = true;
    else if (['--inbox', '--out', '--snapshot'].includes(a)) args[a.slice(2)] = argv[++i];
    else { console.error(`unknown argument: ${a}`); return 2; }
  }
  args.out = args.out || path.join(args.inbox, 'out');
  const entries = readInbox(args.inbox);
  if (!entries.length) { console.log(`No .json files in ${args.inbox}. Nothing to import.`); return 0; }
  const snapshotRows = args.snapshot ? loadSnapshotRows(JSON.parse(fs.readFileSync(args.snapshot, 'utf8'))) : [];
  const problems = [];
  for (const { file, entry } of entries) for (const p of validateEntry(entry)) problems.push(`${file}: ${p}`);
  problems.push(...crossCheck(entries, snapshotRows));
  if (!args.snapshot) console.warn('warning: no --snapshot given, so examples were only checked against the inbox, not the library.');
  if (problems.length) { console.error(problems.join('\n')); return 1; }
  const out = buildOutputs(entries.map((e) => e.entry));
  console.log(`${entries.length} word(s) ok: ${entries.map((e) => e.entry.id).join(', ')}`);
  console.log(`Estimated D1 cost: about ${out.estimate.rows_read} rows read, ${out.estimate.rows_written} rows written.`);
  if (args.check) return 0;
  fs.mkdirSync(args.out, { recursive: true });
  fs.writeFileSync(path.join(args.out, 'insert.sql'), out.insertSql);
  fs.writeFileSync(path.join(args.out, 'verify.sql'), out.verifySql + '\n');
  fs.writeFileSync(path.join(args.out, 'api.json'), JSON.stringify(out.api, null, 2) + '\n');
  console.log(`Wrote ${args.out}/insert.sql, verify.sql, api.json`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (err) { console.error(err.message); process.exitCode = 1; }
}
