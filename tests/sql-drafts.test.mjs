import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTestD1WithMigration } from './helpers/d1-sqlite.mjs';
import { parseRelatedWordsList } from '../functions/_lib/scheduler.js';

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
