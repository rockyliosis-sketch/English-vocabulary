import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestD1WithMigration } from './helpers/d1-sqlite.mjs';
import { getTodayCounts } from '../functions/_lib/vocab-repo.js';
import { onRequestGet as getTodayHandler } from '../functions/api/today.js';
import { onRequestPost as postReviewHandler } from '../functions/api/review.js';

function makeExamples(word) {
  return JSON.stringify([
    { en: `First example with ${word}.`, zh: `包含 ${word} 的第一条例句。` },
    { en: `Second example with ${word}.`, zh: `包含 ${word} 的第二条例句。` },
    { en: `Third example with ${word}.`, zh: `包含 ${word} 的第三条例句。` },
    { en: `Fourth example with ${word}.`, zh: `包含 ${word} 的第四条例句。` }
  ]);
}

function seed14Words(db) {
  // 14 realistic words:
  // - 6 due/overdue & active on 2026-11-10
  // - 2 paused (even though next_review_date <= 2026-11-10, must NOT appear)
  // - 6 due in the future (> 2026-11-10, must NOT appear)
  const words = [
    // Due/overdue & active (6 words)
    ['crave-v-1', 'crave', '/kreɪv/', 'v.', '渴望，热望', '讀文章看到：People crave sugar.', '比 want 强烈', 1, '2026-11-08', 'remembered', '2026-11-05T08:00:00+08:00', 0],
    ['candid-adj-1', 'candid', '/ˈkændɪd/', 'adj.', '坦率的；抓拍的', null, '强调真诚不隐瞒', 0, '2026-11-10', null, null, 0],
    ['tenuous-adj-1', 'tenuous', '/ˈtenjuəs/', 'adj.', '薄弱的，站不住脚的', '   ', '常搭配 tenuous link', 2, '2026-11-09', 'remembered', '2026-11-02T08:00:00+08:00', 0],
    ['mitigate-v-1', 'mitigate', '/ˈmɪtɪɡeɪt/', 'v.', '减轻，缓和', '项目复盘：mitigate risks', '正式用词，宾语常为风险或损失', 3, '2026-11-10', 'remembered', '2026-10-27T08:00:00+08:00', 0],
    ['scrutinize-v-1', 'scrutinize', '/ˈskruːtənaɪz/', 'v.', '仔细检查，细看', null, '强调逐字逐句审视细节', 4, '2026-11-10', 'remembered', '2026-10-11T08:00:00+08:00', 0],
    ['eloquent-adj-1', 'eloquent', '/ˈeləkwənt/', 'adj.', '雄辩的，有说服力的', '演讲视频：an eloquent speaker', '也可形容眼神或沉默富有表现力', 5, '2026-11-10', 'remembered', '2026-09-11T08:00:00+08:00', 0],

    // Paused words (2 words - due date <= 2026-11-10, but paused=1)
    ['obsolete-adj-1', 'obsolete', '/ˌɒbsəˈliːt/', 'adj.', '淘汰的，过时的', null, '已被新技术取代', 2, '2026-11-09', 'remembered', '2026-11-02T08:00:00+08:00', 1],
    ['pragmatic-adj-1', 'pragmatic', '/præɡˈmætɪk/', 'adj.', '务实的，讲究实际的', null, '对比 idealistic', 1, '2026-11-10', 'familiar', '2026-11-09T08:00:00+08:00', 1],

    // Future words (6 words - due date > 2026-11-10, paused=0)
    ['resilient-adj-1', 'resilient', '/rɪˈzɪliənt/', 'adj.', '有韧性的，能迅速恢复的', '心理播客', '指人或系统抗压恢复快', 1, '2026-11-11', 'remembered', '2026-11-08T08:00:00+08:00', 0],
    ['ambiguous-adj-1', 'ambiguous', '/æmˈbɪɡjuəs/', 'adj.', '模棱两可的，含糊不清的', null, '含多个可能解释', 2, '2026-11-14', 'remembered', '2026-11-07T08:00:00+08:00', 0],
    ['ephemeral-adj-1', 'ephemeral', '/ɪˈfemərəl/', 'adj.', '短暂的，转瞬即逝的', '艺术展介绍', '常形容潮流或花期', 3, '2026-11-20', 'remembered', '2026-11-06T08:00:00+08:00', 0],
    ['vindicate-v-1', 'vindicate', '/ˈvɪndɪkeɪt/', 'v.', '证明…无辜；证实…正确', null, '用事实洗清怀疑', 4, '2026-12-01', 'remembered', '2026-11-01T08:00:00+08:00', 0],
    ['meticulous-adj-1', 'meticulous', '/məˈtɪkjələs/', 'adj.', '一丝不苟的，极其细心的', null, '褒义，关注极小细节', 5, '2026-12-25', 'remembered', '2026-10-26T08:00:00+08:00', 0],
    ['lucid-adj-1', 'lucid', '/ˈluːsɪd/', 'adj.', '清晰易懂的；神志清醒的', '书评：a lucid explanation', '常修饰文章、解释或头脑', 0, '2026-11-11', null, null, 0]
  ];

  const stmt = db.sqlite.prepare(`
    INSERT INTO words (
      id, english, ipa, pos, chinese_sense,
      original_context, usage_notes, examples_json,
      added_at, stage, next_review_date,
      last_feedback, last_feedback_at, paused
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const w of words) {
    stmt.run(
      w[0], w[1], w[2], w[3], w[4],
      w[5], w[6], makeExamples(w[1]),
      '2026-11-01T09:00:00+08:00', w[7], w[8],
      w[9], w[10], w[11]
    );
  }

  // Seed one historical review log from an earlier date (2026-11-05) for crave-v-1
  db.sqlite.prepare(`
    INSERT INTO review_logs (
      word_id, review_date, result,
      stage_before, next_review_date_before,
      stage_after, next_review_date_after,
      first_reviewed_at, reviewed_at, press_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'crave-v-1', '2026-11-05', 'remembered',
    0, '2026-11-05',
    1, '2026-11-08',
    '2026-11-05T08:00:00+08:00', '2026-11-05T08:00:00+08:00', 1
  );
}

test('14-word seed, LEFT JOIN morning count, GET /api/today, and POST /api/review full flow', async () => {
  const db = createTestD1WithMigration();
  seed14Words(db);

  // Verify total 14 words in DB
  const totalWordsRow = await db.prepare('SELECT COUNT(*) AS cnt FROM words').first();
  assert.equal(totalWordsRow.cnt, 14);

  // 1. Morning count before any button press on 2026-11-10
  const countBefore = await getTodayCounts(db, '2026-11-10');
  assert.deepEqual(countBefore, {
    date: '2026-11-10',
    total_due_today: 6,
    remaining_due_today: 6,
    completed_today: 0
  });

  // 2. Call GET /api/today?date=2026-11-10
  const getRes1 = await getTodayHandler({
    request: new Request('https://vocab.example.com/api/today?date=2026-11-10'),
    env: { VOCAB_DB: db }
  });
  assert.equal(getRes1.status, 200);
  const body1 = await getRes1.json();
  assert.equal(body1.ok, true);
  assert.equal(body1.cards.length, 6);
  assert.equal(body1.stats.total_due_today, 6);
  assert.equal(body1.stats.remaining_due_today, 6);

  // Check overdue ordering & missing original_context fallback
  const craveBefore = body1.cards.find((c) => c.id === 'crave-v-1');
  const candidBefore = body1.cards.find((c) => c.id === 'candid-adj-1');
  const tenuousBefore = body1.cards.find((c) => c.id === 'tenuous-adj-1');
  assert.ok(craveBefore);
  assert.equal(candidBefore.original_context, '原场景未提供');
  assert.equal(tenuousBefore.original_context, '原场景未提供');
  assert.equal(craveBefore.example.label, '示例');

  // Record crave-v-1's example before pressing any button on 2026-11-10
  // crave-v-1 has past_review_days=1 (from 2026-11-05) and overdueDays=2 (due 2026-11-08 vs today 2026-11-10)
  // (1 + 2) % 4 = 3 -> 4th example
  assert.equal(craveBefore.example.index, 3);
  const craveExampleEnBefore = craveBefore.example.en;

  // 3. First button press on crave-v-1 on 2026-11-10: click "remembered"
  // Initial stage=1 -> stage_after=2 (+7 days -> 2026-11-17)
  const postRes1 = await postReviewHandler({
    request: new Request('https://vocab.example.com/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word_id: 'crave-v-1',
        result: 'remembered',
        date: '2026-11-10'
      })
    }),
    env: { VOCAB_DB: db, __TEST_NOW: '2026-11-10T00:14:10Z' } // 08:14:10+08:00
  });
  assert.equal(postRes1.status, 200);
  const review1 = (await postRes1.json()).review;
  assert.deepEqual(review1, {
    word_id: 'crave-v-1',
    review_date: '2026-11-10',
    result: 'remembered',
    stage_before: 1,
    next_review_date_before: '2026-11-08',
    stage_after: 2,
    next_review_date_after: '2026-11-17',
    first_reviewed_at: '2026-11-10T08:14:10+08:00',
    reviewed_at: '2026-11-10T08:14:10+08:00',
    press_count: 1
  });

  // 4. Verify morning count SQL AFTER pressing 1 card:
  // total_due_today MUST still be 6 (does not underreport!), remaining_due_today is 5
  const countAfter1 = await getTodayCounts(db, '2026-11-10');
  assert.deepEqual(countAfter1, {
    date: '2026-11-10',
    total_due_today: 6,
    remaining_due_today: 5,
    completed_today: 1
  });

  // 5. Verify GET /api/today after button press:
  // crave-v-1's example MUST NOT jump to another sentence on refresh!
  const getRes2 = await getTodayHandler({
    request: new Request('https://vocab.example.com/api/today?date=2026-11-10'),
    env: { VOCAB_DB: db }
  });
  const body2 = await getRes2.json();
  const craveAfter1 = body2.cards.find((c) => c.id === 'crave-v-1');
  assert.equal(craveAfter1.today_result, 'remembered');
  assert.equal(craveAfter1.example.index, 3);
  assert.equal(craveAfter1.example.en, craveExampleEnBefore);

  // 6. Second press on crave-v-1 on the SAME day (2026-11-10): click "remembered" again
  // MUST NOT jump from stage 2 to stage 3! Must recalculate from stage_before=1 -> stage_after=2
  const postRes2 = await postReviewHandler({
    request: new Request('https://vocab.example.com/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word_id: 'crave-v-1',
        result: 'remembered',
        date: '2026-11-10'
      })
    }),
    env: { VOCAB_DB: db, __TEST_NOW: '2026-11-10T00:14:25Z' } // 08:14:25+08:00
  });
  const review2 = (await postRes2.json()).review;
  assert.equal(review2.stage_before, 1);
  assert.equal(review2.stage_after, 2);
  assert.equal(review2.next_review_date_after, '2026-11-17');
  assert.equal(review2.press_count, 2);
  assert.equal(review2.first_reviewed_at, '2026-11-10T08:14:10+08:00');
  assert.equal(review2.reviewed_at, '2026-11-10T08:14:25+08:00');

  // 7. Third press on crave-v-1 on the SAME day (2026-11-10): change mind to "familiar"
  // Recalculates from stage_before=1 -> stage_after=0, next_review_date_after=2026-11-11
  const postRes3 = await postReviewHandler({
    request: new Request('https://vocab.example.com/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word_id: 'crave-v-1',
        result: 'familiar',
        date: '2026-11-10'
      })
    }),
    env: { VOCAB_DB: db, __TEST_NOW: '2026-11-10T00:15:00Z' } // 08:15:00+08:00
  });
  const review3 = (await postRes3.json()).review;
  assert.equal(review3.stage_before, 1);
  assert.equal(review3.stage_after, 0);
  assert.equal(review3.next_review_date_after, '2026-11-11');
  assert.equal(review3.press_count, 3);

  // Verify words table state for crave-v-1 matches the latest press
  const wordRow = await db.prepare('SELECT stage, next_review_date, last_feedback, last_feedback_at FROM words WHERE id = ?').bind('crave-v-1').first();
  assert.deepEqual(wordRow, {
    stage: 0,
    next_review_date: '2026-11-11',
    last_feedback: 'familiar',
    last_feedback_at: '2026-11-10T08:15:00+08:00'
  });

  // Verify historical logs: 2026-11-05 row + 2026-11-10 row = 2 rows total for crave-v-1
  const { results: logs } = await db.prepare('SELECT review_date, result, stage_before, stage_after, press_count FROM review_logs WHERE word_id = ? ORDER BY review_date ASC').bind('crave-v-1').all();
  assert.deepEqual(logs, [
    { review_date: '2026-11-05', result: 'remembered', stage_before: 0, stage_after: 1, press_count: 1 },
    { review_date: '2026-11-10', result: 'familiar', stage_before: 1, stage_after: 0, press_count: 3 }
  ]);

  // 8. Test stage 5 word (eloquent-adj-1) clicking "remembered" stays at stage 5 (+60 days)
  const postStage5 = await postReviewHandler({
    request: new Request('https://vocab.example.com/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word_id: 'eloquent-adj-1',
        result: 'remembered',
        date: '2026-11-10'
      })
    }),
    env: { VOCAB_DB: db, __TEST_NOW: '2026-11-10T00:16:00Z' }
  });
  const reviewStage5 = (await postStage5.json()).review;
  assert.equal(reviewStage5.stage_before, 5);
  assert.equal(reviewStage5.stage_after, 5);
  assert.equal(reviewStage5.next_review_date_after, '2027-01-09');

  // 9. Test paused word rejection (409)
  const postPaused = await postReviewHandler({
    request: new Request('https://vocab.example.com/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word_id: 'obsolete-adj-1',
        result: 'remembered',
        date: '2026-11-10'
      })
    }),
    env: { VOCAB_DB: db }
  });
  assert.equal(postPaused.status, 409);
});
