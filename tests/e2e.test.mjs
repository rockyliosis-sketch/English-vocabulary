import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestD1WithMigration } from './helpers/d1-sqlite.mjs';
import { onRequestGet as getTodayHandler } from '../functions/api/today.js';
import { onRequestPost as postReviewHandler } from '../functions/api/review.js';
import { createFlashcardApp } from '../public/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class MockClassList {
  constructor() {
    this.set = new Set();
  }
  toggle(cls, force) {
    const shouldAdd = force !== undefined ? Boolean(force) : !this.set.has(cls);
    if (shouldAdd) this.set.add(cls);
    else this.set.delete(cls);
    return shouldAdd;
  }
  contains(cls) {
    return this.set.has(cls);
  }
}

class MockElement {
  constructor(id, attrs = {}) {
    this.id = id;
    this.hidden = Boolean(attrs.hidden);
    this.disabled = false;
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.attrs = { ...attrs };
    this.classList = new MockClassList();
    this.listeners = new Map();
  }
  getAttribute(name) {
    return this.attrs[name] ?? null;
  }
  setAttribute(name, val) {
    this.attrs[name] = String(val);
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  click() {
    const list = this.listeners.get('click') || [];
    for (const fn of list) {
      fn({ preventDefault() {}, stopPropagation() {} });
    }
  }
  focus() {}
  select() {}
}

function createMockDomAndWindow(db, queryDate = '2026-11-10') {
  const elements = new Map([
    ['review-date', new MockElement('review-date')],
    ['sync-indicator', new MockElement('sync-indicator', { hidden: true })],
    ['btn-prev-card', new MockElement('btn-prev-card', { hidden: true })],
    ['progress-text', new MockElement('progress-text')],
    ['status-banner', new MockElement('status-banner', { hidden: true })],
    ['loading-view', new MockElement('loading-view')],
    ['empty-view', new MockElement('empty-view', { hidden: true })],
    ['card-view', new MockElement('card-view', { hidden: true })],
    ['done-view', new MockElement('done-view', { hidden: true })],
    ['flashcard', new MockElement('flashcard', { 'aria-expanded': 'false' })],
    ['card-front', new MockElement('card-front')],
    ['card-back', new MockElement('card-back', { hidden: true })],
    ['word-pos', new MockElement('word-pos')],
    ['today-graded-badge', new MockElement('today-graded-badge', { hidden: true })],
    ['word-english', new MockElement('word-english')],
    ['word-ipa', new MockElement('word-ipa')],
    ['flip-hint', new MockElement('flip-hint')],
    ['word-chinese', new MockElement('word-chinese')],
    ['word-context', new MockElement('word-context')],
    ['word-notes', new MockElement('word-notes')],
    ['example-label', new MockElement('example-label')],
    ['example-en', new MockElement('example-en')],
    ['example-zh', new MockElement('example-zh')],
    ['action-bar', new MockElement('action-bar', { hidden: true })],
    ['btn-remembered', new MockElement('btn-remembered', { 'data-result': 'remembered' })],
    ['btn-familiar', new MockElement('btn-familiar', { 'data-result': 'familiar' })],
    ['btn-forgotten', new MockElement('btn-forgotten', { 'data-result': 'forgotten' })],
    ['done-subtitle', new MockElement('done-subtitle')],
    ['stat-remembered', new MockElement('stat-remembered')],
    ['stat-familiar', new MockElement('stat-familiar')],
    ['stat-forgotten', new MockElement('stat-forgotten')],
    ['btn-copy-results', new MockElement('btn-copy-results')],
    ['btn-review-cards', new MockElement('btn-review-cards')],
    ['copy-feedback', new MockElement('copy-feedback', { hidden: true })],
    ['copy-preview', new MockElement('copy-preview')]
  ]);

  const storage = new Map();
  let clipboardText = '';

  const doc = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    execCommand() {
      return true;
    }
  };

  const win = {
    location: { search: `?date=${queryDate}` },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v))
    },
    navigator: {
      clipboard: {
        async writeText(txt) {
          clipboardText = txt;
        }
      }
    },
    async fetch(url, init = {}) {
      const fullUrl = new URL(url, 'https://vocab.example.com').toString();
      const req = new Request(fullUrl, init);
      if (fullUrl.includes('/api/today')) {
        return getTodayHandler({ request: req, env: { VOCAB_DB: db } });
      }
      if (fullUrl.includes('/api/review')) {
        return postReviewHandler({
          request: req,
          env: { VOCAB_DB: db, __TEST_NOW: '2026-11-10T00:20:00Z' }
        });
      }
      throw new Error(`Unexpected fetch URL: ${fullUrl}`);
    },
    getClipboardText() {
      return clipboardText;
    }
  };

  return { doc, win, elements };
}

test('Mobile flashcard UI + D1 API end-to-end flow: two-step flip, refresh resume, same-day re-grade, and JSON export', async () => {
  // Verify public/index.html contains all required element IDs
  const indexHtml = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf-8');
  assert.match(indexHtml, /id="flashcard"/);
  assert.match(indexHtml, /id="card-back"[^>]*hidden/);
  assert.match(indexHtml, /id="action-bar"[^>]*hidden/);
  assert.match(indexHtml, /noindex, nofollow, noarchive/);

  const db = createTestD1WithMigration();
  // Insert 2 due words on 2026-11-10 (one overdue with context, one due today without context)
  const insertStmt = db.sqlite.prepare(`
    INSERT INTO words (
      id, english, ipa, pos, chinese_sense,
      original_context, usage_notes, examples_json,
      added_at, stage, next_review_date,
      last_feedback, last_feedback_at, paused
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(
    'crave-v-1', 'crave', '/kreɪv/', 'v.', '渴望，热望',
    '读文章：People crave sugar.', '比 want 语气强烈',
    JSON.stringify([
      { en: 'She craved a quiet evening.', zh: '她渴望一个安静的夜晚。' },
      { en: 'He craves attention.', zh: '他渴望关注。' },
      { en: 'They crave fresh air.', zh: '他们渴望新鲜空气。' }
    ]),
    '2026-11-01T09:00:00+08:00', 1, '2026-11-08', 'remembered', '2026-11-05T08:00:00+08:00', 0
  );

  insertStmt.run(
    'candid-adj-1', 'candid', '/ˈkændɪd/', 'adj.', '坦率的，直言不讳的',
    null, '强调真诚不隐瞒',
    JSON.stringify([
      { en: 'He gave a candid reply.', zh: '他给出了坦率的回答。' },
      { en: 'She was candid about the risks.', zh: '她对风险直言不讳。' },
      { en: 'I appreciate your candid feedback.', zh: '我感激你坦诚的反馈。' }
    ]),
    '2026-11-09T09:00:00+08:00', 0, '2026-11-10', null, null, 0
  );

  const { doc, win, elements } = createMockDomAndWindow(db, '2026-11-10');
  globalThis.window = win;
  const app = createFlashcardApp(doc, win);
  await app.init();

  // 1. Card #1 (crave-v-1) initially shows ONLY English, IPA, POS; back & 3 buttons are hidden
  assert.equal(elements.get('card-view').hidden, false);
  assert.equal(elements.get('word-english').textContent, 'crave');
  assert.equal(elements.get('word-ipa').textContent, '/kreɪv/');
  assert.equal(elements.get('word-pos').textContent, 'v.');
  assert.equal(elements.get('card-back').hidden, true);
  assert.equal(elements.get('action-bar').hidden, true);
  assert.equal(elements.get('progress-text').textContent, '1 / 2');

  const card1ExampleBefore = elements.get('example-en').textContent;

  // 2. Tap card to flip -> reveals meaning, context, notes, "示例" example, AND 3 buttons
  app.revealCard();
  assert.equal(elements.get('card-back').hidden, false);
  assert.equal(elements.get('action-bar').hidden, false);
  assert.equal(elements.get('word-chinese').textContent, '渴望，热望');
  assert.equal(elements.get('word-context').textContent, '读文章：People crave sugar.');
  assert.equal(elements.get('example-label').textContent, '示例');

  // 3. Click "记住了" on Card #1 -> advances to Card #2 (unflipped, buttons hidden again)
  await app.handleGradeClick('remembered');
  assert.equal(elements.get('progress-text').textContent, '2 / 2');
  assert.equal(elements.get('word-english').textContent, 'candid');
  assert.equal(elements.get('card-back').hidden, true);
  assert.equal(elements.get('action-bar').hidden, true);

  // 4. Simulate page refresh in browser: resumes directly at Card #2 (candid),
  // and going back to Card #1 shows the exact same example sentence
  const { doc: doc2, win: win2, elements: els2 } = createMockDomAndWindow(db, '2026-11-10');
  globalThis.window = win2;
  const app2 = createFlashcardApp(doc2, win2);
  await app2.init();
  assert.equal(els2.get('word-english').textContent, 'candid');
  assert.equal(els2.get('progress-text').textContent, '2 / 2');

  // Navigate back to Card #1 and verify example sentence did not jump
  els2.get('btn-prev-card').click();
  assert.equal(els2.get('word-english').textContent, 'crave');
  assert.equal(els2.get('example-en').textContent, card1ExampleBefore);

  // Re-grade Card #1 on the same day to "remembered" again -> stage must stay 2 (not 3)
  app2.revealCard();
  await app2.handleGradeClick('remembered');
  assert.equal(els2.get('word-english').textContent, 'candid');

  // Flip Card #2 (candid, which has null original_context -> must show "原场景未提供")
  app2.revealCard();
  assert.equal(els2.get('word-context').textContent, '原场景未提供');
  await app2.handleGradeClick('familiar');

  // 5. All cards completed -> shows done view with summary and "一键复制今日结果"
  assert.equal(els2.get('done-view').hidden, false);
  assert.equal(els2.get('stat-remembered').textContent, '1');
  assert.equal(els2.get('stat-familiar').textContent, '1');
  assert.equal(els2.get('stat-forgotten').textContent, '0');

  await app2.copyResultsToClipboard();
  const copied = JSON.parse(win2.getClipboardText());
  assert.equal(copied.schema_version, 2);
  assert.equal(copied.date, '2026-11-10');
  assert.equal(copied.all_synced, true);
  assert.equal(copied.unsynced_count, 0);
  assert.match(copied.exported_at, /\+08:00$/);
  assert.equal(copied.results.length, 2);
  assert.equal(copied.results[0].word_id, 'crave-v-1');
  assert.equal(copied.results[0].stage_before, 1);
  assert.equal(copied.results[0].stage_after, 2);
  assert.equal(copied.results[0].press_count, 2);
  assert.equal(copied.results[0].synced, true);
});

test('Failed POST /api/review stays as pending_retry (not skipped on refresh, never falsely completed, accurate stage_after in export)', async () => {
  const db = createTestD1WithMigration();
  db.sqlite.prepare(`
    INSERT INTO words (
      id, english, ipa, pos, chinese_sense,
      original_context, usage_notes, examples_json,
      added_at, stage, next_review_date,
      last_feedback, last_feedback_at, paused
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'crave-v-1', 'crave', '/kreɪv/', 'v.', '渴望，热望',
    '读文章：People crave sugar.', '比 want 语气强烈',
    JSON.stringify([
      { en: 'She craved a quiet evening.', zh: '她渴望一个安静的夜晚。' },
      { en: 'He craves attention.', zh: '他渴望关注。' },
      { en: 'They crave fresh air.', zh: '他们渴望新鲜空气。' }
    ]),
    '2026-11-01T09:00:00+08:00', 1, '2026-11-08', 'remembered', '2026-11-05T08:00:00+08:00', 0
  );

  const env1 = createMockDomAndWindow(db, '2026-11-10');
  let failPost = true;
  const origFetch = env1.win.fetch.bind(env1.win);
  env1.win.fetch = async (url, init = {}) => {
    if (String(url).includes('/api/review') && failPost) {
      throw new Error('Network disconnected');
    }
    return origFetch(url, init);
  };

  globalThis.window = env1.win;
  const app1 = createFlashcardApp(env1.doc, env1.win);
  await app1.init();

  // 1. Flip the only card (crave-v-1, stage=1, due=2026-11-08) and click "记住了" while POST fails
  app1.revealCard();
  await app1.handleGradeClick('remembered');

  // Must stay on Card #1 (currentIndex === 0) and MUST NOT show done-view!
  assert.equal(app1.state.currentIndex, 0);
  assert.equal(env1.elements.get('card-view').hidden, false);
  assert.equal(env1.elements.get('done-view').hidden, true);
  assert.equal(env1.elements.get('status-banner').hidden, false);
  assert.match(env1.elements.get('today-graded-badge').textContent, /待重试：记住了（未同步）/);

  // Confirmed receiptsMap must be empty; pendingRetriesMap has the computed stage_after=2, next_review_date_after=2026-11-17
  assert.equal(app1.state.receiptsMap.size, 0);
  const pending1 = app1.state.pendingRetriesMap.get('crave-v-1');
  assert.ok(pending1);
  assert.equal(pending1.stage_before, 1);
  assert.equal(pending1.next_review_date_before, '2026-11-08');
  assert.equal(pending1.stage_after, 2);
  assert.equal(pending1.next_review_date_after, '2026-11-17');
  assert.equal(pending1.synced, false);
  assert.equal(pending1.sync_status, 'pending_retry');

  // 2. Refresh page while POST is STILL failing (sharing the same localStorage)
  const env2 = createMockDomAndWindow(db, '2026-11-10');
  env2.win.localStorage = env1.win.localStorage;
  env2.win.fetch = env1.win.fetch;
  globalThis.window = env2.win;

  const app2 = createFlashcardApp(env2.doc, env2.win);
  await app2.init();

  // Must NOT skip crave-v-1 and must NOT show "今日复习已完成" (#done-view)!
  assert.equal(app2.state.currentIndex, 0);
  assert.equal(env2.elements.get('card-view').hidden, false);
  assert.equal(env2.elements.get('done-view').hidden, true);
  assert.equal(env2.elements.get('word-english').textContent, 'crave');
  assert.equal(app2.state.isRevealed, true);
  assert.match(env2.elements.get('status-banner').textContent, /待重试/);

  // 3. Verify exported JSON when containing unsynced pending retry:
  // stage_after and next_review_date_after are calculated from stage_before + result, and synced: false is marked
  await app2.copyResultsToClipboard();
  const exportedWhileOffline = JSON.parse(env2.win.getClipboardText());
  assert.equal(exportedWhileOffline.all_synced, false);
  assert.equal(exportedWhileOffline.unsynced_count, 1);
  assert.equal(exportedWhileOffline.results.length, 1);
  assert.deepEqual(
    {
      word_id: exportedWhileOffline.results[0].word_id,
      result: exportedWhileOffline.results[0].result,
      stage_before: exportedWhileOffline.results[0].stage_before,
      next_review_date_before: exportedWhileOffline.results[0].next_review_date_before,
      stage_after: exportedWhileOffline.results[0].stage_after,
      next_review_date_after: exportedWhileOffline.results[0].next_review_date_after,
      synced: exportedWhileOffline.results[0].synced,
      sync_status: exportedWhileOffline.results[0].sync_status
    },
    {
      word_id: 'crave-v-1',
      result: 'remembered',
      stage_before: 1,
      next_review_date_before: '2026-11-08',
      stage_after: 2,
      next_review_date_after: '2026-11-17',
      synced: false,
      sync_status: 'pending_retry'
    }
  );

  // 4. Network recovers -> refreshing page auto-retries pending submission into D1 and completes session!
  failPost = false;
  const env3 = createMockDomAndWindow(db, '2026-11-10');
  env3.win.localStorage = env1.win.localStorage;
  globalThis.window = env3.win;

  const app3 = createFlashcardApp(env3.doc, env3.win);
  await app3.init();

  assert.equal(app3.state.pendingRetriesMap.size, 0);
  assert.equal(app3.state.receiptsMap.size, 1);
  assert.equal(app3.state.receiptsMap.get('crave-v-1').synced, true);
  assert.equal(env3.elements.get('done-view').hidden, false);
  assert.equal(env3.elements.get('stat-remembered').textContent, '1');
});

