import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTestD1WithMigration } from './helpers/d1-sqlite.mjs';
import { parseRelatedWordsList, normalizeExampleText } from '../functions/_lib/scheduler.js';
import { buildTopUpSql, TOP_UP_CANDIDATES, normalizationCtes } from '../scripts/build-example-top-up-sql.mjs';

// Only synthetic sentences enter SQLite. IDs and proposed related-word content are
// read from the drafts under test; the private snapshot is never loaded here.
const cleanupSql = fs.readFileSync(new URL('../scripts/sql-drafts/01-remove-context-examples.sql', import.meta.url), 'utf8');
const relatedSql = fs.readFileSync(new URL('../scripts/sql-drafts/02-fill-related-words.sql', import.meta.url), 'utf8');
const cleanupIds = [...cleanupSql.matchAll(/^\s*\('([^']+)'\)/gm)].map((m) => m[1]);
const relatedIds = [...relatedSql.matchAll(/WHERE id = '([^']+)' AND related_words_json = '\[\]';/g)].map((m) => m[1]);
const context = 'A fictional silver lantern shines.';
const duplicate = { en: context, zh: '虚构的银灯发光。' };
const first = { en: 'A made-up river glows.', zh: '虚构的河流发光。', source: 'synthetic metadata' };
const second = { en: 'An imaginary kite rises.', zh: '想象中的风筝升起。' };

function seed(db, id, examples = [duplicate, first, second], originalContext = context, related = '[]') {
  db.sqlite.prepare(`INSERT INTO words (id, english, ipa, pos, chinese_sense,
    original_context, usage_notes, examples_json, related_words_json,
    added_at, stage, next_review_date, last_feedback, last_feedback_at, paused)
    VALUES (?, 'fictional', '/ˈfɪkʃənəl/', 'adj.', '虚构的', ?, '虚构备注', ?, ?,
      '2026-11-01T09:00:00+08:00', 3, '2026-11-20', 'remembered', '2026-11-06T08:00:00+08:00', 1)`)
    .run(id, originalContext, JSON.stringify(examples), related);
  db.sqlite.prepare(`INSERT INTO review_logs (word_id, review_date, result, stage_before,
    next_review_date_before, stage_after, next_review_date_after, first_reviewed_at, reviewed_at, press_count)
    VALUES (?, '2026-11-06', 'remembered', 2, '2026-11-05', 3, '2026-11-20',
      '2026-11-06T08:00:00+08:00', '2026-11-06T08:00:00+08:00', 2)`).run(id);
}
function snapshot(db) {
  return {
    words: db.sqlite.prepare('SELECT * FROM words ORDER BY id').all().map((r) => ({ ...r })),
    logs: db.sqlite.prepare('SELECT * FROM review_logs ORDER BY id').all().map((r) => ({ ...r }))
  };
}
function assertOnlyColumnChanged(before, after, column) {
  const omit = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => k !== column)));
  assert.deepEqual(omit(after.words), omit(before.words));
  assert.deepEqual(after.logs, before.logs);
}

test('Cleanup draft removes all exact duplicates in order, preserves metadata/state/logs, and is idempotent', () => {
  const db = createTestD1WithMigration();
  try {
    assert.equal(cleanupIds.length, 7);
    for (const id of cleanupIds) seed(db, id, [duplicate, first, duplicate, second]);
    seed(db, 'fictional-unlisted');
    const before = snapshot(db);
    db.exec(cleanupSql);
    const after = snapshot(db);
    assertOnlyColumnChanged(before, after, 'examples_json');
    for (const id of cleanupIds) {
      const row = after.words.find((w) => w.id === id);
      assert.deepEqual(JSON.parse(row.examples_json), [first, second]);
    }
    assert.deepEqual(after.words.find((w) => w.id === 'fictional-unlisted'), before.words.find((w) => w.id === 'fictional-unlisted'));
    db.exec(cleanupSql);
    assert.deepEqual(snapshot(db), after);
  } finally { db.sqlite.close(); }
});

test('Cleanup draft leaves at least one example and skips changed, missing, or non-exact contexts', () => {
  const db = createTestD1WithMigration();
  try {
    seed(db, cleanupIds[0], [duplicate]);
    seed(db, cleanupIds[1], [duplicate, duplicate]);
    seed(db, cleanupIds[2], [first, second]);
    seed(db, cleanupIds[3], [duplicate, first], null);
    seed(db, cleanupIds[4], [duplicate, first], 'A changed fictional context.');
    seed(db, cleanupIds[5], [duplicate, first], '  A FICTIONAL silver lantern shines?!  ');
    seed(db, cleanupIds[6], [duplicate, first], '');
    const before = snapshot(db);
    db.exec(cleanupSql);
    assert.deepEqual(snapshot(db), before);
  } finally { db.sqlite.close(); }
});

test('Related-word draft fills all 39 IDs with 3–6 valid items and changes only its target column', () => {
  const db = createTestD1WithMigration();
  try {
    assert.equal(relatedIds.length, 39);
    assert.equal(new Set(relatedIds).size, 39);
    for (const id of relatedIds) seed(db, id);
    seed(db, 'fictional-unlisted');
    const before = snapshot(db);
    db.exec(relatedSql);
    const after = snapshot(db);
    assertOnlyColumnChanged(before, after, 'related_words_json');
    for (const id of relatedIds) {
      const row = after.words.find((w) => w.id === id);
      const list = parseRelatedWordsList(row.related_words_json);
      assert.ok(list.length >= 3 && list.length <= 6, id);
      assert.equal(new Set(list.map((w) => w.english.toLowerCase())).size, list.length, id);
      for (const item of list) assert.match(item.ipa, /^\/[^/]+\/$/u);
    }
    assert.equal(after.words.find((w) => w.id === 'fictional-unlisted').related_words_json, '[]');
    db.exec(relatedSql);
    assert.deepEqual(snapshot(db), after);
  } finally { db.sqlite.close(); }
});

test('Related-word draft strictly protects existing content, NULL, noncanonical empty text, and missing IDs', () => {
  const db = createTestD1WithMigration();
  try {
    const protectedValues = [
      '[{"english":"imaginary","ipa":"/ɪˈmædʒəneri/","pos":"adj.","zh":"想象的","relation":"相关"}]',
      null, '', '[ ]'
    ];
    for (const [i, value] of protectedValues.entries()) seed(db, relatedIds[i], [first], context, value);
    const before = snapshot(db);
    db.exec(relatedSql);
    assert.deepEqual(snapshot(db), before);
  } finally { db.sqlite.close(); }
});

// Draft 03's sentences are newly authored, not imported from the private snapshot.
// All pre-existing database contents below are synthetic.
const topUpSql = fs.readFileSync(new URL('../scripts/sql-drafts/03-top-up-examples.sql', import.meta.url), 'utf8');
const sqlQuote = (s) => `'${s.replaceAll("'", "''")}'`;
const usable = (list, originalContext) => list.filter((e) => !normalizeExampleText(originalContext) || normalizeExampleText(e.en) !== normalizeExampleText(originalContext));

function seedEmptyAllowed(db, id, examples, originalContext = context) {
  // A real D1 row cannot normally contain []; explicitly relax only while seeding
  // this requested legacy/unknown-state fixture, then restore the actual constraint.
  db.exec('PRAGMA ignore_check_constraints = ON;');
  try { seed(db, id, examples, originalContext); }
  finally { db.exec('PRAGMA ignore_check_constraints = OFF;'); }
}

test('Top-up artifact is reproducible and SQL normalization agrees with the runtime including Unicode', () => {
  assert.equal(topUpSql, buildTopUpSql());
  const db = createTestD1WithMigration();
  try {
    const texts = ['', ' \t\n', '  A\tSILVER\nlantern?! ', 'A silver-lantern.',
      '\u00a0Hello\u2003WORLD。 “ ”\uFEFF', 'CAFÉ', 'İSTANBUL', 'Kelvin',
      'ΟΣ', 'ΟΣΑ', 'ΟΣ\u0301', 'AΣ!', 'AΣ\u0301B', 'Σ', 'ᾈ', '𐐀 Test…', '「Hi」',
      ...TOP_UP_CANDIDATES.map((c) => c.en)];
    const query = `WITH RECURSIVE ${normalizationCtes(texts.map((s) => `SELECT ${sqlQuote(s)} AS raw`).join(' UNION '))} SELECT * FROM normalized`;
    for (const row of db.sqlite.prepare(query).all()) assert.equal(row.key, normalizeExampleText(row.raw), JSON.stringify(row.raw));
    assert.throws(() => buildTopUpSql([{ id: 'fictional', en: 'Same.', zh: '相同' }, { id: 'other', en: ' SAME!', zh: '重复' }]), /distinct/);
  } finally { db.sqlite.close(); }
});

test('Top-up handles empty, short, contextual and already sufficient online pools without losing data', () => {
  for (const id of ['scope-n-1', 'range-n-1']) {
    const pool = TOP_UP_CANDIDATES.filter((c) => c.id === id);
    const existingCandidate = { en: ` \t${pool[0].en.toUpperCase().replaceAll(' ', '\u00a0')}?! `, zh: '已有虚构译文', source: 'keep me' };
    const cases = [
      { list: [], count: 3 },
      { list: [first], count: 3 },
      { list: [duplicate, first], count: 4 },
      { list: [first, second], count: 3 },
      { list: [first, second, { en: 'A fictional otter swims.', zh: '虚构水獭游泳。' }], unchanged: true },
      { list: [existingCandidate], count: 3 },
      { list: [duplicate, first, duplicate, second], count: 5 },
      // Keeping all five originals and a raw maximum of five makes this impossible.
      { list: [duplicate, first, duplicate, second, duplicate], unchanged: true }
    ];
    for (const scenario of cases) {
      const db = createTestD1WithMigration();
      try {
        seedEmptyAllowed(db, id, scenario.list);
        const before = snapshot(db);
        db.exec(topUpSql);
        const after = snapshot(db);
        assertOnlyColumnChanged(before, after, 'examples_json');
        const list = JSON.parse(after.words[0].examples_json);
        assert.deepEqual(list.slice(0, scenario.list.length), scenario.list);
        if (scenario.unchanged) assert.deepEqual(after, before);
        else {
          assert.equal(list.length, scenario.count);
          assert.equal(usable(list, context).length, 3);
          assert.ok(list.length <= 5);
          for (const addition of list.slice(scenario.list.length)) {
            assert.notEqual(normalizeExampleText(addition.en), normalizeExampleText(context));
            assert.equal(list.filter((e) => normalizeExampleText(e.en) === normalizeExampleText(addition.en)).length, 1);
          }
        }
        db.exec(topUpSql);
        assert.deepEqual(snapshot(db), after);
      } finally { db.sqlite.close(); }
    }
  }
});

test('Top-up counts normalized context variants before deciding the shortfall and skips a candidate equal to context', () => {
  for (const currentContext of [' \nA FICTIONAL\t SILVER lantern shines？！ ', TOP_UP_CANDIDATES[0].en.toUpperCase() + '!!']) {
    const db = createTestD1WithMigration();
    try {
      const list = [{ en: currentContext.toLowerCase().trim().replaceAll('\t', ' ') + '。', zh: '虚构原场景变体。' }, first];
      seedEmptyAllowed(db, 'scope-n-1', list, currentContext);
      db.exec(topUpSql);
      const result = JSON.parse(snapshot(db).words[0].examples_json);
      assert.equal(result.length, 4);
      assert.equal(usable(result, currentContext).length, 3);
      for (const addition of result.slice(2)) assert.notEqual(normalizeExampleText(addition.en), normalizeExampleText(currentContext));
    } finally { db.sqlite.close(); }
  }
});

test('Top-up rejects collisions with any other word example or context and falls back to unused candidates', () => {
  const db = createTestD1WithMigration();
  try {
    const pool = TOP_UP_CANDIDATES.filter((c) => c.id === 'scope-n-1');
    seedEmptyAllowed(db, 'scope-n-1', []);
    seed(db, 'fictional-other', [{ en: pool[0].en.toUpperCase() + '?!', zh: '其它词已有。' }], pool[1].en.replaceAll(' ', '\t'));
    const before = snapshot(db);
    db.exec(topUpSql);
    const after = snapshot(db);
    assertOnlyColumnChanged(before, after, 'examples_json');
    assert.deepEqual(after.words.find((w) => w.id === 'fictional-other'), before.words.find((w) => w.id === 'fictional-other'));
    assert.deepEqual(JSON.parse(after.words.find((w) => w.id === 'scope-n-1').examples_json).map((e) => e.en), pool.slice(2).map((c) => c.en));
  } finally { db.sqlite.close(); }
});

test('Top-up makes no partial change when too few unshared candidates remain', () => {
  const db = createTestD1WithMigration();
  try {
    const pool = TOP_UP_CANDIDATES.filter((c) => c.id === 'scope-n-1');
    seedEmptyAllowed(db, 'scope-n-1', []);
    seed(db, 'fictional-other', pool.slice(0, 3).map(({ en, zh }) => ({ en, zh })));
    const before = snapshot(db);
    db.exec(topUpSql);
    assert.deepEqual(snapshot(db), before);
  } finally { db.sqlite.close(); }
});

test('Top-up safely skips malformed pools and unnormalizable global text without changing any column', () => {
  const db = createTestD1WithMigration();
  try {
    seed(db, 'scope-n-1');
    for (const bad of ['broken json', '{}', '[42]', '[{"en":"test"}]', '[{"en":"\u00a0","zh":"测试"}]']) {
      db.exec('PRAGMA ignore_check_constraints = ON;');
      db.sqlite.prepare('UPDATE words SET examples_json = ?').run(bad);
      db.exec('PRAGMA ignore_check_constraints = OFF;');
      const before = snapshot(db);
      db.exec(topUpSql);
      assert.deepEqual(snapshot(db), before);
    }
    db.sqlite.prepare('UPDATE words SET examples_json = ?').run(JSON.stringify([first]));
    seed(db, 'fictional-other');
    for (const unusual of ['x'.repeat(2001), 'a\0b']) {
      db.sqlite.prepare("UPDATE words SET original_context = ? WHERE id = 'fictional-other'").run(unusual);
      const before = snapshot(db);
      db.exec(topUpSql);
      assert.deepEqual(snapshot(db), before);
    }
  } finally { db.sqlite.close(); }
});

test('Top-up preview audits the minimum for every word and exposes blocked plans without writing', () => {
  const db = createTestD1WithMigration();
  try {
    seed(db, 'scope-n-1', [first]);
    seed(db, 'range-n-1', [duplicate, first, duplicate, second, duplicate]);
    seed(db, 'fictional-no-candidates', [first]);
    seed(db, 'fictional-sufficient', [first, second, { en: 'A synthetic fox sleeps.', zh: '虚构狐狸睡觉。' }]);
    const before = snapshot(db);
    const prefix = topUpSql.slice(0, topUpSql.lastIndexOf('\nUPDATE words\n'));
    const preview = db.sqlite.prepare(prefix + '\nSELECT id, raw_count, usable_count, needed, available, status FROM plans ORDER BY id;').all();
    const byId = Object.fromEntries(preview.map((r) => [r.id, r]));
    assert.equal(preview.length, 4);
    assert.equal(byId['scope-n-1'].status, 'ready');
    assert.equal(byId['scope-n-1'].needed, 2);
    assert.equal(byId['range-n-1'].status, 'blocked_capacity');
    assert.equal(byId['fictional-no-candidates'].status, 'blocked_candidates');
    assert.equal(byId['fictional-sufficient'].status, 'already_sufficient');
    assert.deepEqual(snapshot(db), before);
    db.exec(topUpSql);
    const after = snapshot(db);
    assertOnlyColumnChanged(before, after, 'examples_json');
    for (const row of before.words.filter((r) => r.id !== 'scope-n-1')) {
      assert.deepEqual(after.words.find((r) => r.id === row.id), row);
    }
  } finally { db.sqlite.close(); }
});
