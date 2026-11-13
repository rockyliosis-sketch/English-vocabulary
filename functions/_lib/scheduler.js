/**
 * Core scheduling, Beijing timezone (+08:00), daily example rotation,
 * and card normalization pure functions.
 */

export const STAGE_DAYS = Object.freeze([1, 3, 7, 14, 30, 60]);
export const MIN_STAGE = 0;
export const MAX_STAGE = 5;

export const VALID_RESULTS = Object.freeze(['remembered', 'familiar', 'forgotten']);

export const MISSING_CONTEXT_TEXT = '原场景未提供';
export const MISSING_NOTES_TEXT = '暂无辨析注解';
export const EXAMPLE_LABEL = '示例';

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(num) {
  return String(num).padStart(2, '0');
}

/**
 * Validates that a string is a real calendar date in YYYY-MM-DD format.
 */
export function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const match = DATE_RE.exec(dateStr);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/**
 * Parses a YYYY-MM-DD string into UTC midnight epoch milliseconds.
 */
export function parseDateToUtcMs(dateStr) {
  if (!isValidDateString(dateStr)) {
    throw new Error(`Invalid date string (expected YYYY-MM-DD): ${String(dateStr)}`);
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * Formats a Date, epoch ms, or ISO timestamp string into Beijing date YYYY-MM-DD.
 */
export function getBeijingDateString(input = Date.now()) {
  const dateObj = input instanceof Date ? input : new Date(input);
  const ms = dateObj.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid timestamp input: ${String(input)}`);
  }
  const bj = new Date(ms + BEIJING_OFFSET_MS);
  const y = bj.getUTCFullYear();
  const m = pad2(bj.getUTCMonth() + 1);
  const d = pad2(bj.getUTCDate());
  return `${y}-${m}-${d}`;
}

/**
 * Formats a Date, epoch ms, or ISO timestamp string into Beijing ISO 8601
 * string with explicit +08:00 offset: YYYY-MM-DDTHH:mm:ss+08:00.
 */
export function formatBeijingTimestamp(input = Date.now()) {
  const dateObj = input instanceof Date ? input : new Date(input);
  const ms = dateObj.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid timestamp input: ${String(input)}`);
  }
  const bj = new Date(ms + BEIJING_OFFSET_MS);
  const y = bj.getUTCFullYear();
  const m = pad2(bj.getUTCMonth() + 1);
  const d = pad2(bj.getUTCDate());
  const hh = pad2(bj.getUTCHours());
  const mm = pad2(bj.getUTCMinutes());
  const ss = pad2(bj.getUTCSeconds());
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}+08:00`;
}

/**
 * Adds an integer number of days to a YYYY-MM-DD date string.
 */
export function addDays(dateStr, days) {
  if (!Number.isInteger(days)) {
    throw new Error(`days must be an integer, got: ${String(days)}`);
  }
  const baseMs = parseDateToUtcMs(dateStr);
  const target = new Date(baseMs + days * DAY_MS);
  const y = target.getUTCFullYear();
  const m = pad2(target.getUTCMonth() + 1);
  const d = pad2(target.getUTCDate());
  return `${y}-${m}-${d}`;
}

/**
 * Computes (toDateStr - fromDateStr) in integer calendar days.
 */
export function diffDays(fromDateStr, toDateStr) {
  const fromMs = parseDateToUtcMs(fromDateStr);
  const toMs = parseDateToUtcMs(toDateStr);
  return Math.round((toMs - fromMs) / DAY_MS);
}

/**
 * Computes initial schedule for a newly added word on addedDate (YYYY-MM-DD).
 * Rule: New words start at stage 0, next_review_date = addedDate + 1 day.
 */
export function computeNewWordSchedule(addedDateOrTimestamp) {
  const addedDate = isValidDateString(addedDateOrTimestamp)
    ? addedDateOrTimestamp
    : getBeijingDateString(addedDateOrTimestamp);
  return {
    stage: MIN_STAGE,
    next_review_date: addDays(addedDate, STAGE_DAYS[MIN_STAGE])
  };
}

/**
 * Resolves the frozen baseline state BEFORE the first button press on reviewDate.
 * Rule: If the word was already pressed on reviewDate (todayLog exists), we MUST
 * use todayLog.stage_before and todayLog.next_review_date_before so repeated presses
 * on the same day never cascade stage increments.
 */
export function resolveBaseStateForDay({ word, todayLog = null }) {
  if (!word || typeof word !== 'object') {
    throw new Error('word object is required');
  }
  if (todayLog && typeof todayLog === 'object' && todayLog.stage_before !== undefined && todayLog.stage_before !== null) {
    const stageBefore = Number(todayLog.stage_before);
    const nextReviewDateBefore = String(todayLog.next_review_date_before);
    if (!Number.isInteger(stageBefore) || stageBefore < MIN_STAGE || stageBefore > MAX_STAGE) {
      throw new Error(`Invalid todayLog.stage_before: ${String(todayLog.stage_before)}`);
    }
    if (!isValidDateString(nextReviewDateBefore)) {
      throw new Error(`Invalid todayLog.next_review_date_before: ${nextReviewDateBefore}`);
    }
    return {
      stageBefore,
      nextReviewDateBefore,
      firstReviewedAt: todayLog.first_reviewed_at || null,
      pressCountBefore: Number(todayLog.press_count) || 1
    };
  }

  const stageBefore = Number(word.stage);
  const nextReviewDateBefore = String(word.next_review_date);
  if (!Number.isInteger(stageBefore) || stageBefore < MIN_STAGE || stageBefore > MAX_STAGE) {
    throw new Error(`Invalid word.stage: ${String(word.stage)}`);
  }
  if (!isValidDateString(nextReviewDateBefore)) {
    throw new Error(`Invalid word.next_review_date: ${nextReviewDateBefore}`);
  }
  return {
    stageBefore,
    nextReviewDateBefore,
    firstReviewedAt: null,
    pressCountBefore: 0
  };
}

/**
 * Computes the new stage and next_review_date from the baseline stage before today's first press.
 *
 * Rules:
 * - Stage ladder: [1, 3, 7, 14, 30, 60] days for stages 0..5.
 * - remembered (记住了): stage_after = min(stage_before + 1, 5), next_review_date = review_date + STAGE_DAYS[stage_after].
 *   (At stage 5, remembered stays at stage 5 and adds 60 days).
 * - familiar (有点熟): stage_after = max(stage_before - 1, 0), next_review_date = review_date + 1 day (tomorrow).
 * - forgotten (忘了): stage_after = 0, next_review_date = review_date + 1 day (tomorrow).
 */
export function computeReviewTransition({ stageBefore, reviewDate, result }) {
  if (!Number.isInteger(stageBefore) || stageBefore < MIN_STAGE || stageBefore > MAX_STAGE) {
    throw new Error(`stageBefore must be an integer between ${MIN_STAGE} and ${MAX_STAGE}, got: ${String(stageBefore)}`);
  }
  if (!isValidDateString(reviewDate)) {
    throw new Error(`Invalid reviewDate: ${String(reviewDate)}`);
  }
  if (!VALID_RESULTS.includes(result)) {
    throw new Error(`Invalid review result: ${String(result)}. Expected one of ${VALID_RESULTS.join(', ')}`);
  }

  let stageAfter;
  let intervalDays;

  if (result === 'remembered') {
    stageAfter = Math.min(stageBefore + 1, MAX_STAGE);
    intervalDays = STAGE_DAYS[stageAfter];
  } else if (result === 'familiar') {
    stageAfter = Math.max(stageBefore - 1, MIN_STAGE);
    intervalDays = 1;
  } else {
    // 'forgotten'
    stageAfter = MIN_STAGE;
    intervalDays = 1;
  }

  const nextReviewDateAfter = addDays(reviewDate, intervalDays);

  return {
    result,
    reviewDate,
    stageBefore,
    stageAfter,
    intervalDays,
    nextReviewDateAfter
  };
}

/**
 * Parses and validates examples array (from array or JSON string).
 */
export function parseExamplesList(examplesOrJson) {
  let list = examplesOrJson;
  if (typeof examplesOrJson === 'string') {
    try {
      list = JSON.parse(examplesOrJson);
    } catch (err) {
      throw new Error(`Invalid examples_json string: ${err.message}`);
    }
  }
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('examples list must be a non-empty array');
  }
  return list.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Example at index ${idx} must be an object`);
    }
    const en = typeof item.en === 'string' ? item.en.trim() : '';
    const zh = typeof item.zh === 'string' ? item.zh.trim() : '';
    if (!en || !zh) {
      throw new Error(`Example at index ${idx} must have non-empty en and zh strings`);
    }
    return { en, zh };
  });
}

/** Comparison only: preserve displayed text and internal punctuation. */
export function normalizeExampleText(value) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/gu, ' ').toLowerCase().replace(/[\p{P}\s]+$/gu, '')
    : '';
}

/**
 * Deterministically selects today's rotated example sentence for a word.
 *
 * Crucial requirement:
 * - Overdue days MUST be calculated from the next_review_date BEFORE today's first press
 *   (i.e. todayLog.next_review_date_before if present, otherwise word.next_review_date),
 *   and pastReviewDays counts only review_logs with review_date < today.
 * - This guarantees that pressing a button today and refreshing the page NEVER causes
 *   today's displayed example sentence to jump to another sentence.
 */
export function selectDailyExample({
  examples,
  originalContext = null,
  pastReviewDays = 0,
  dueDateBeforeToday,
  today
}) {
  const parsedExamples = parseExamplesList(examples);
  const context = normalizeExampleText(originalContext);
  const filtered = context
    ? parsedExamples.filter((item) => normalizeExampleText(item.en) !== context)
    : parsedExamples;
  const candidates = filtered.length ? filtered : parsedExamples;
  if (!Number.isInteger(pastReviewDays) || pastReviewDays < 0) {
    throw new Error(`pastReviewDays must be a non-negative integer, got: ${String(pastReviewDays)}`);
  }
  if (!isValidDateString(dueDateBeforeToday)) {
    throw new Error(`Invalid dueDateBeforeToday: ${String(dueDateBeforeToday)}`);
  }
  if (!isValidDateString(today)) {
    throw new Error(`Invalid today date: ${String(today)}`);
  }

  const overdueDays = Math.max(0, diffDays(dueDateBeforeToday, today));
  const index = (pastReviewDays + overdueDays) % candidates.length;
  const chosen = candidates[index];

  return {
    index,
    total: candidates.length,
    overdueDays,
    pastReviewDays,
    label: EXAMPLE_LABEL,
    en: chosen.en,
    zh: chosen.zh
  };
}

/**
 * Normalizes a database/raw word row into a frontend-ready card object
 * with fallback texts ("原场景未提供") and stable daily example rotation.
 */
export function formatWordCardForToday({
  word,
  todayLog = null,
  pastReviewDays = 0,
  today
}) {
  const baseState = resolveBaseStateForDay({ word, todayLog });
  const rawContext = typeof word.original_context === 'string' ? word.original_context.trim() : '';
  const rawNotes = typeof word.usage_notes === 'string' ? word.usage_notes.trim() : '';

  const rawExamples = word.examples !== undefined ? word.examples : word.examples_json;
  const example = selectDailyExample({
    examples: rawExamples,
    originalContext: rawContext,
    pastReviewDays,
    dueDateBeforeToday: baseState.nextReviewDateBefore,
    today
  });

  return {
    id: String(word.id),
    english: String(word.english),
    ipa: String(word.ipa),
    pos: String(word.pos),
    chinese_sense: String(word.chinese_sense),
    original_context: rawContext || MISSING_CONTEXT_TEXT,
    has_original_context: Boolean(rawContext),
    usage_notes: rawNotes || MISSING_NOTES_TEXT,
    example: {
      label: EXAMPLE_LABEL,
      en: example.en,
      zh: example.zh,
      index: example.index,
      total: example.total
    },
    stage: Number(word.stage),
    next_review_date: String(word.next_review_date),
    stage_before_today: baseState.stageBefore,
    next_review_date_before_today: baseState.nextReviewDateBefore,
    today_result: todayLog ? todayLog.result : null,
    today_reviewed_at: todayLog ? todayLog.reviewed_at : null,
    today_press_count: todayLog ? Number(todayLog.press_count) || 1 : 0
  };
}
