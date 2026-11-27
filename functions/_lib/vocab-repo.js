/**
 * Cloudflare D1 repository for vocabulary due cards, morning counts,
 * and atomic button review submissions.
 */

import {
  VALID_RESULTS,
  DEFAULT_DAILY_LIMIT,
  MAX_DAILY_LIMIT,
  isValidDateString,
  getBeijingDateString,
  formatBeijingTimestamp,
  resolveBaseStateForDay,
  computeReviewTransition,
  formatWordCardForToday
} from './scheduler.js';

/**
 * Standard morning count SQL with LEFT JOIN review_logs.
 * Returns both total_due_today (unaffected if user already reviewed some cards today)
 * and remaining_due_today.
 */
export const MORNING_DUE_COUNT_SQL = `
SELECT
  COUNT(*) AS total_due_today,
  COALESCE(SUM(CASE WHEN r.word_id IS NULL THEN 1 ELSE 0 END), 0) AS remaining_due_today
FROM words w
LEFT JOIN review_logs r
  ON r.word_id = w.id AND r.review_date = ?
WHERE w.paused = 0
  AND (w.next_review_date <= ? OR r.word_id IS NOT NULL);
`.trim();

/**
 * Cards already reviewed on dateStr (indexed via idx_review_logs_date + words PK).
 */
export const TODAY_REVIEWED_CARDS_SQL = `
SELECT
  w.id,
  w.english,
  w.ipa,
  w.pos,
  w.chinese_sense,
  w.original_context,
  w.usage_notes,
  w.examples_json,
  w.related_words_json,
  w.added_at,
  w.stage,
  w.next_review_date,
  w.last_feedback,
  w.last_feedback_at,
  w.paused,
  r.result AS today_result,
  r.stage_before AS today_stage_before,
  r.next_review_date_before AS today_due_before,
  r.stage_after AS today_stage_after,
  r.next_review_date_after AS today_due_after,
  r.first_reviewed_at AS today_first_reviewed_at,
  r.reviewed_at AS today_reviewed_at,
  r.press_count AS today_press_count,
  (
    SELECT COUNT(*)
    FROM review_logs rl
    WHERE rl.word_id = w.id
      AND rl.review_date < ?
  ) AS past_review_days
FROM review_logs r
INNER JOIN words w
  ON w.id = r.word_id
WHERE r.review_date = ?
  AND w.paused = 0
ORDER BY r.first_reviewed_at ASC, w.id ASC
LIMIT 200;
`.trim();

/**
 * Counts unreviewed due cards using idx_words_due + review_logs unique covering index.
 */
export const TODAY_PENDING_DUE_COUNT_SQL = `
SELECT COUNT(*) AS pending_due_total
FROM words w
WHERE w.paused = 0
  AND w.next_review_date <= ?
  AND NOT EXISTS (
    SELECT 1
    FROM review_logs r
    WHERE r.word_id = w.id
      AND r.review_date = ?
  );
`.trim();

/**
 * Loads up to LIMIT unreviewed due cards ordered by learning priority:
 * 0: forgotten (weakest, rescue first)
 * 1: familiar (consolidate)
 * 2: new words (last_feedback IS NULL, interleave fresh words)
 * 3: remembered (lower stage first, then earliest due date)
 */
export const TODAY_PENDING_DUE_CARDS_SQL = `
SELECT
  w.id,
  w.english,
  w.ipa,
  w.pos,
  w.chinese_sense,
  w.original_context,
  w.usage_notes,
  w.examples_json,
  w.related_words_json,
  w.added_at,
  w.stage,
  w.next_review_date,
  w.last_feedback,
  w.last_feedback_at,
  w.paused,
  (
    SELECT COUNT(*)
    FROM review_logs rl
    WHERE rl.word_id = w.id
      AND rl.review_date < ?
  ) AS past_review_days
FROM words w
WHERE w.paused = 0
  AND w.next_review_date <= ?
  AND NOT EXISTS (
    SELECT 1
    FROM review_logs r
    WHERE r.word_id = w.id
      AND r.review_date = ?
  )
ORDER BY
  CASE
    WHEN w.last_feedback = 'forgotten' THEN 0
    WHEN w.last_feedback = 'familiar' THEN 1
    WHEN w.last_feedback IS NULL THEN 2
    ELSE 3
  END ASC,
  w.stage ASC,
  w.next_review_date ASC,
  w.id ASC
LIMIT ?;
`.trim();

const WORD_BY_ID_SQL = `
SELECT
  id, english, ipa, pos, chinese_sense,
  original_context, usage_notes, examples_json, related_words_json,
  added_at, stage, next_review_date,
  last_feedback, last_feedback_at, paused
FROM words
WHERE id = ?;
`.trim();

const TODAY_LOG_BY_WORD_SQL = `
SELECT
  id, word_id, review_date, result,
  stage_before, next_review_date_before,
  stage_after, next_review_date_after,
  first_reviewed_at, reviewed_at, press_count
FROM review_logs
WHERE word_id = ? AND review_date = ?;
`.trim();

const UPSERT_REVIEW_LOG_SQL = `
INSERT INTO review_logs (
  word_id, review_date, result,
  stage_before, next_review_date_before,
  stage_after, next_review_date_after,
  first_reviewed_at, reviewed_at, press_count
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
ON CONFLICT(word_id, review_date) DO UPDATE SET
  result = excluded.result,
  stage_after = excluded.stage_after,
  next_review_date_after = excluded.next_review_date_after,
  reviewed_at = excluded.reviewed_at,
  press_count = review_logs.press_count + 1;
`.trim();

const UPDATE_WORD_STATE_SQL = `
UPDATE words
SET stage = ?,
    next_review_date = ?,
    last_feedback = ?,
    last_feedback_at = ?
WHERE id = ?;
`.trim();

export class HttpError extends Error {
  constructor(status, message, code = 'BAD_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Executes the standard LEFT JOIN morning count query for a given Beijing date.
 */
export async function getTodayCounts(db, dateStr = getBeijingDateString()) {
  if (!isValidDateString(dateStr)) {
    throw new HttpError(400, `Invalid date format (expected YYYY-MM-DD): ${String(dateStr)}`, 'INVALID_DATE');
  }
  const row = await db
    .prepare(MORNING_DUE_COUNT_SQL)
    .bind(dateStr, dateStr)
    .first();

  const totalDueToday = Number(row?.total_due_today ?? 0);
  const remainingDueToday = Number(row?.remaining_due_today ?? 0);
  return {
    date: dateStr,
    total_due_today: totalDueToday,
    remaining_due_today: remainingDueToday,
    completed_today: Math.max(0, totalDueToday - remainingDueToday)
  };
}

function normalizeDailyLimit(limit) {
  if (limit === undefined || limit === null || limit === '') {
    return DEFAULT_DAILY_LIMIT;
  }
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_DAILY_LIMIT) {
    throw new HttpError(
      400,
      `Invalid limit (expected integer 1..${MAX_DAILY_LIMIT}): ${String(limit)}`,
      'INVALID_LIMIT'
    );
  }
  return parsed;
}

/**
 * Loads today's paced review session:
 * - Always includes cards already reviewed on dateStr (so progress & re-grading stay intact).
 * - Fills remaining slots up to `limit` (default 15) with unreviewed due cards ordered by priority
 *   (forgotten -> familiar -> new -> remembered).
 * - Reports `deferred_due_count` and `has_more_due` so overflow silently defers or can be loaded on demand.
 */
export async function getTodaySession(
  db,
  dateStr = getBeijingDateString(),
  { limit = DEFAULT_DAILY_LIMIT } = {}
) {
  if (!isValidDateString(dateStr)) {
    throw new HttpError(400, `Invalid date format (expected YYYY-MM-DD): ${String(dateStr)}`, 'INVALID_DATE');
  }
  const effectiveLimit = normalizeDailyLimit(limit);

  const [{ results: reviewedRows = [] }, pendingCountRow] = await Promise.all([
    db.prepare(TODAY_REVIEWED_CARDS_SQL).bind(dateStr, dateStr).all(),
    db.prepare(TODAY_PENDING_DUE_COUNT_SQL).bind(dateStr, dateStr).first()
  ]);

  const pendingDueTotal = Number(pendingCountRow?.pending_due_total ?? 0);
  const remainingSlots = Math.max(0, effectiveLimit - reviewedRows.length);

  let pendingRows = [];
  if (remainingSlots > 0 && pendingDueTotal > 0) {
    const res = await db
      .prepare(TODAY_PENDING_DUE_CARDS_SQL)
      .bind(dateStr, dateStr, dateStr, remainingSlots)
      .all();
    pendingRows = res?.results || [];
  }

  const cards = [];
  const todayResults = [];
  const deferredDueCount = Math.max(0, pendingDueTotal - pendingRows.length);
  const stats = {
    total_due_today: reviewedRows.length + pendingRows.length,
    remaining_due_today: pendingRows.length,
    completed_today: reviewedRows.length,
    daily_limit: effectiveLimit,
    total_backlog_due: reviewedRows.length + pendingDueTotal,
    deferred_due_count: deferredDueCount,
    has_more_due: deferredDueCount > 0,
    remembered: 0,
    familiar: 0,
    forgotten: 0
  };

  for (const row of reviewedRows) {
    const todayLog = {
      word_id: row.id,
      review_date: dateStr,
      result: row.today_result,
      stage_before: Number(row.today_stage_before),
      next_review_date_before: row.today_due_before,
      stage_after: Number(row.today_stage_after),
      next_review_date_after: row.today_due_after,
      first_reviewed_at: row.today_first_reviewed_at,
      reviewed_at: row.today_reviewed_at,
      press_count: Number(row.today_press_count) || 1
    };

    const card = formatWordCardForToday({
      word: row,
      todayLog,
      pastReviewDays: Number(row.past_review_days) || 0,
      today: dateStr
    });
    cards.push(card);

    if (stats[todayLog.result] !== undefined) {
      stats[todayLog.result] += 1;
    }
    todayResults.push({
      word_id: row.id,
      review_date: dateStr,
      result: todayLog.result,
      stage_before: todayLog.stage_before,
      next_review_date_before: todayLog.next_review_date_before,
      stage_after: todayLog.stage_after,
      next_review_date_after: todayLog.next_review_date_after,
      reviewed_at: todayLog.reviewed_at,
      press_count: todayLog.press_count
    });
  }

  for (const row of pendingRows) {
    const card = formatWordCardForToday({
      word: row,
      todayLog: null,
      pastReviewDays: Number(row.past_review_days) || 0,
      today: dateStr
    });
    cards.push(card);
  }

  return {
    schema_version: 2,
    date: dateStr,
    stats,
    cards,
    results: todayResults
  };
}

/**
 * Records a button press in D1 atomically:
 * - Locks stage_before and next_review_date_before on the first press of the day.
 * - On subsequent presses on the same day, recalculates strictly from stage_before.
 * - Updates both review_logs and words inside a single db.batch() transaction.
 */
export async function submitReviewResult(
  db,
  { wordId, result, reviewDate = null, now = Date.now() }
) {
  const cleanWordId = typeof wordId === 'string' ? wordId.trim() : '';
  if (!cleanWordId) {
    throw new HttpError(400, 'word_id is required', 'MISSING_WORD_ID');
  }
  if (!VALID_RESULTS.includes(result)) {
    throw new HttpError(
      400,
      `Invalid result "${String(result)}". Must be one of: ${VALID_RESULTS.join(', ')}`,
      'INVALID_RESULT'
    );
  }

  const reviewedAt = formatBeijingTimestamp(now);
  const effectiveDate = reviewDate ? String(reviewDate).trim() : getBeijingDateString(now);
  if (!isValidDateString(effectiveDate)) {
    throw new HttpError(400, `Invalid review date: ${effectiveDate}`, 'INVALID_DATE');
  }

  const word = await db.prepare(WORD_BY_ID_SQL).bind(cleanWordId).first();
  if (!word) {
    throw new HttpError(404, `Word not found: ${cleanWordId}`, 'WORD_NOT_FOUND');
  }
  if (Number(word.paused) === 1) {
    throw new HttpError(409, `Word is paused and cannot be reviewed: ${cleanWordId}`, 'WORD_PAUSED');
  }

  const existingLog = await db
    .prepare(TODAY_LOG_BY_WORD_SQL)
    .bind(cleanWordId, effectiveDate)
    .first();

  const baseState = resolveBaseStateForDay({
    word,
    todayLog: existingLog
  });

  const transition = computeReviewTransition({
    stageBefore: baseState.stageBefore,
    reviewDate: effectiveDate,
    result
  });

  const firstReviewedAt = baseState.firstReviewedAt || reviewedAt;
  const pressCount = baseState.pressCountBefore + 1;

  await db.batch([
    db.prepare(UPSERT_REVIEW_LOG_SQL).bind(
      cleanWordId,
      effectiveDate,
      result,
      baseState.stageBefore,
      baseState.nextReviewDateBefore,
      transition.stageAfter,
      transition.nextReviewDateAfter,
      firstReviewedAt,
      reviewedAt
    ),
    db.prepare(UPDATE_WORD_STATE_SQL).bind(
      transition.stageAfter,
      transition.nextReviewDateAfter,
      result,
      reviewedAt,
      cleanWordId
    )
  ]);

  return {
    ok: true,
    review: {
      word_id: cleanWordId,
      review_date: effectiveDate,
      result,
      stage_before: baseState.stageBefore,
      next_review_date_before: baseState.nextReviewDateBefore,
      stage_after: transition.stageAfter,
      next_review_date_after: transition.nextReviewDateAfter,
      first_reviewed_at: firstReviewedAt,
      reviewed_at: reviewedAt,
      press_count: pressCount
    }
  };
}
