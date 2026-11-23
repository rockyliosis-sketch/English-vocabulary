import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTestD1WithMigration } from './helpers/d1-sqlite.mjs';
import {
  validateEntry, crossCheck, buildOutputs, nextDay, INSERT_SQL, ID_RE
} from '../scripts/import-inbox.mjs';

// Synthetic words only; the real library is never loaded here.
function entry(overrides = {}) {
  return {
    id: 'glimmer-n-1',
    english: 'glimmer',
    ipa: '/ˈɡlɪmər/',
    pos: 'noun',
    chinese_sense: '微光；一丝（希望）',
    original_context: 'There is still a glimmer of hope.',
    usage_notes: '常见搭配 a glimmer of hope。',
    examples_json: [
      { en: 'We saw a glimmer of light under the door.', zh: '我们看到门缝下有一丝光。' },
      { en: 'The candle gave off a faint glimmer.', zh: '蜡烛发出微弱的光。' },
      { en: 'Her smile showed a glimmer of relief.', zh: '她的笑容里透出一丝宽慰。' }
    ],
    related_words_json: [{ english: 'glimmer', ipa: '/ˈɡlɪmər/', pos: 'v.', zh: '发微光', relation: '同词族' }],
    added_at: '2026-11-23T23:40:00+08:00',
    stage: 0,
    next_review_date: '2026-11-24',
    last_feedback: null,
    last_feedback_at: null,
    paused: 0,
    ...overrides
  };
}

test('id pattern and next-day rule follow the card conventions', () => {
  for (const id of ['spend-v-1', 'make-sense-phrase-1', 'approach-n-2', 'carry-on-adj-1']) assert.ok(ID_RE.test(id), id);
  for (const id of ['Spend-v-1', 'spend-verb-1', 'spend-v-0', 'spend v 1']) assert.ok(!ID_RE.test(id), id);
  assert.equal(nextDay('2026-11-30T23:59:00+08:00'), '2026-12-01');
  assert.equal(nextDay('2026-12-31T08:00:00+08:00'), '2027-01-01');
  assert.equal(nextDay('2026-11-23T10:00:00Z'), null);
});

test('validateEntry accepts a well-formed card and rejects rule breaks', () => {
  assert.deepEqual(validateEntry(entry()), []);
  assert.deepEqual(validateEntry(entry({ original_context: null })), []);
  const bad = validateEntry(entry({
    added_at: '2026-11-23T15:40:00Z',
    stage: 2,
    original_context: '',
    examples_json: [{ en: 'Only one.', zh: '只有一条。' }]
  }));
  assert.ok(bad.some((e) => e.includes('added_at')));
  assert.ok(bad.some((e) => e.includes('stage')));
  assert.ok(bad.some((e) => e.includes('use null')));
  assert.ok(bad.some((e) => e.includes('3–5')));
  const ctx = validateEntry(entry({ examples_json: [
    { en: 'there is still a glimmer of hope', zh: 'x' }, ...entry().examples_json
  ] }));
  assert.ok(ctx.some((e) => e.includes('repeats original_context')));
  assert.ok(validateEntry(entry({ next_review_date: '2026-11-23' })).some((e) => e.includes('day after')));
});

test('crossCheck catches existing ids and examples reused from the library or the inbox', () => {
  const library = [{ id: 'glimmer-n-1', examples_json: '[]' }, {
    id: 'faint-adj-1', original_context: null,
    examples_json: JSON.stringify([{ en: 'The candle gave off a faint glimmer!', zh: '…' }])
  }];
  const problems = crossCheck([{ file: 'a.json', entry: entry() }], library);
  assert.ok(problems.some((p) => p.includes('already exists')));
  assert.ok(problems.some((p) => p.includes('library:faint-adj-1')));
  const twin = entry({ id: 'glimmer-v-1', original_context: null });
  const inboxProblems = crossCheck([{ file: 'a.json', entry: entry() }, { file: 'b.json', entry: twin }], []);
  assert.ok(inboxProblems.some((p) => p.startsWith('b.json') && p.includes('inbox:glimmer-n-1')));
});

test('generated SQL inserts once, never touches an existing card, and stays on the primary key', () => {
  const db = createTestD1WithMigration();
  // An existing card with progress that must survive a conflicting import.
  db.sqlite.prepare(`INSERT INTO words (id, english, ipa, pos, chinese_sense, original_context, usage_notes,
    examples_json, added_at, stage, next_review_date, last_feedback, last_feedback_at, paused)
    VALUES ('old-adj-1', 'old', '/oʊld/', 'adjective', '旧的', NULL, NULL, '[{"en":"An old map.","zh":"旧地图。"}]',
    '2026-11-01T09:00:00+08:00', 3, '2026-12-01', 'remembered', '2026-11-20T09:00:00+08:00', 0)`).run();
  const before = db.sqlite.prepare("SELECT * FROM words WHERE id = 'old-adj-1'").get();
  const conflicting = entry({ id: 'old-adj-1', english: 'old', original_context: null });
  const out = buildOutputs([entry(), conflicting]);

  db.exec(out.insertSql);
  db.exec(out.insertSql); // re-running is harmless
  assert.deepEqual({ ...db.sqlite.prepare("SELECT * FROM words WHERE id = 'old-adj-1'").get() }, { ...before });
  const row = db.sqlite.prepare("SELECT * FROM words WHERE id = 'glimmer-n-1'").get();
  assert.equal(row.stage, 0);
  assert.equal(row.paused, 0);
  assert.equal(row.last_feedback, null);
  assert.equal(row.next_review_date, '2026-11-24');
  assert.deepEqual(JSON.parse(row.examples_json), entry().examples_json);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM words').get().n, 2);

  const verified = db.sqlite.prepare(out.verifySql).all();
  assert.deepEqual(verified.map((r) => r.id).sort(), ['glimmer-n-1', 'old-adj-1']);

  // Query plans: the verify SELECT must be a primary-key SEARCH, never a SCAN.
  const plan = db.sqlite.prepare(`EXPLAIN QUERY PLAN ${out.verifySql}`).all().map((r) => r.detail).join(' | ');
  assert.match(plan, /SEARCH words USING INDEX sqlite_autoindex_words_1/);
  assert.doesNotMatch(plan, /\bSCAN\b/);
  for (const sql of [out.insertSql, out.verifySql]) {
    assert.doesNotMatch(sql, /WITH\s+RECURSIVE|INSERT\s+OR\s+REPLACE|DELETE\s|DROP\s|UPDATE\s/i);
  }

  // The API form is parameterised and runs the same way.
  const api = out.api[0];
  assert.equal(api.sql, INSERT_SQL);
  const db2 = createTestD1WithMigration();
  assert.equal(db2.sqlite.prepare(api.sql).run(...api.params).changes, 1);
  assert.equal(db2.sqlite.prepare(api.sql).run(...api.params).changes, 0);
});

test('CLI validates an inbox folder and writes the three outputs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-'));
  fs.writeFileSync(path.join(dir, '20261123-glimmer-n-1.json'), JSON.stringify(entry()));
  const script = new URL('../scripts/import-inbox.mjs', import.meta.url).pathname;
  const log = execFileSync(process.execPath, [script, '--inbox', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(log, /1 word\(s\) ok: glimmer-n-1/);
  assert.match(log, /about 3 rows read/);
  for (const f of ['insert.sql', 'verify.sql', 'api.json']) assert.ok(fs.existsSync(path.join(dir, 'out', f)), f);
  fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify(entry({ id: 'bad', stage: 1 })));
  assert.throws(() => execFileSync(process.execPath, [script, '--inbox', dir, '--check'], { stdio: 'pipe' }));
});
