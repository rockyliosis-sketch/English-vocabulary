import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_DAYS,
  MISSING_CONTEXT_TEXT,
  EXAMPLE_LABEL,
  isValidDateString,
  getBeijingDateString,
  formatBeijingTimestamp,
  addDays,
  diffDays,
  computeNewWordSchedule,
  resolveBaseStateForDay,
  computeReviewTransition,
  selectDailyExample,
  formatWordCardForToday
} from '../functions/_lib/scheduler.js';

test('Beijing time (+08:00) formatting and date arithmetic', () => {
  // 2026-11-09T23:30:05Z is 2026-11-10T07:30:05+08:00 in Beijing
  const utcLateNight = '2026-11-09T23:30:05Z';
  assert.equal(getBeijingDateString(utcLateNight), '2026-11-10');
  assert.equal(formatBeijingTimestamp(utcLateNight), '2026-11-10T07:30:05+08:00');

  assert.equal(isValidDateString('2026-11-10'), true);
  assert.equal(isValidDateString('2026-02-29'), false);
  assert.equal(isValidDateString('2028-02-29'), true);
  assert.equal(isValidDateString('2026-11-1'), false);

  assert.equal(addDays('2026-11-10', 1), '2026-11-11');
  assert.equal(addDays('2026-11-10', 30), '2026-12-10');
  assert.equal(addDays('2026-11-10', 60), '2027-01-09');
  assert.equal(diffDays('2026-11-08', '2026-11-10'), 2);
});

test('New word starts at stage 0 and is due the next day', () => {
  const s1 = computeNewWordSchedule('2026-11-10');
  assert.deepEqual(s1, { stage: 0, next_review_date: '2026-11-11' });

  const s2 = computeNewWordSchedule('2026-11-09T20:00:00Z'); // 2026-11-10 04:00+08:00
  assert.deepEqual(s2, { stage: 0, next_review_date: '2026-11-11' });
});

test('Stage ladder [1, 3, 7, 14, 30, 60] transitions for all stages 0..5', () => {
  assert.deepEqual(STAGE_DAYS, [1, 3, 7, 14, 30, 60]);
  const reviewDate = '2026-11-10';

  const expectedRemembered = [
    { stageBefore: 0, stageAfter: 1, intervalDays: 3, nextReviewDateAfter: '2026-11-13' },
    { stageBefore: 1, stageAfter: 2, intervalDays: 7, nextReviewDateAfter: '2026-11-17' },
    { stageBefore: 2, stageAfter: 3, intervalDays: 14, nextReviewDateAfter: '2026-11-24' },
    { stageBefore: 3, stageAfter: 4, intervalDays: 30, nextReviewDateAfter: '2026-12-10' },
    { stageBefore: 4, stageAfter: 5, intervalDays: 60, nextReviewDateAfter: '2027-01-09' },
    // Stage 5 remembered again stays at stage 5 (+60 days)
    { stageBefore: 5, stageAfter: 5, intervalDays: 60, nextReviewDateAfter: '2027-01-09' }
  ];

  for (const exp of expectedRemembered) {
    const res = computeReviewTransition({
      stageBefore: exp.stageBefore,
      reviewDate,
      result: 'remembered'
    });
    assert.equal(res.stageAfter, exp.stageAfter);
    assert.equal(res.intervalDays, exp.intervalDays);
    assert.equal(res.nextReviewDateAfter, exp.nextReviewDateAfter);
  }

  // Familiar: stage - 1 (min 0), always reviewed next day (+1 day)
  const expectedFamiliar = [0, 0, 1, 2, 3, 4];
  for (let stageBefore = 0; stageBefore <= 5; stageBefore++) {
    const res = computeReviewTransition({
      stageBefore,
      reviewDate,
      result: 'familiar'
    });
    assert.equal(res.stageAfter, expectedFamiliar[stageBefore]);
    assert.equal(res.intervalDays, 1);
    assert.equal(res.nextReviewDateAfter, '2026-11-11');
  }

  // Forgotten: always returns to stage 0, reviewed next day (+1 day)
  for (let stageBefore = 0; stageBefore <= 5; stageBefore++) {
    const res = computeReviewTransition({
      stageBefore,
      reviewDate,
      result: 'forgotten'
    });
    assert.equal(res.stageAfter, 0);
    assert.equal(res.intervalDays, 1);
    assert.equal(res.nextReviewDateAfter, '2026-11-11');
  }
});

test('Same-day multiple presses always calculate from stage_before of first press today', () => {
  const reviewDate = '2026-11-10';
  // Initial state before any press on 2026-11-10: stage 2, due 2026-11-10
  let word = {
    id: 'crave-v-1',
    stage: 2,
    next_review_date: '2026-11-10'
  };
  let todayLog = null;

  // 1st press: remembered -> stage 3, due 2026-11-24
  const base1 = resolveBaseStateForDay({ word, todayLog });
  assert.equal(base1.stageBefore, 2);
  const t1 = computeReviewTransition({
    stageBefore: base1.stageBefore,
    reviewDate,
    result: 'remembered'
  });
  assert.equal(t1.stageAfter, 3);
  assert.equal(t1.nextReviewDateAfter, '2026-11-24');

  // Update word & todayLog as DB would after 1st press
  word = { ...word, stage: t1.stageAfter, next_review_date: t1.nextReviewDateAfter };
  todayLog = {
    word_id: word.id,
    review_date: reviewDate,
    result: 'remembered',
    stage_before: base1.stageBefore,
    next_review_date_before: base1.nextReviewDateBefore,
    stage_after: t1.stageAfter,
    next_review_date_after: t1.nextReviewDateAfter,
    first_reviewed_at: '2026-11-10T08:10:00+08:00',
    reviewed_at: '2026-11-10T08:10:00+08:00',
    press_count: 1
  };

  // 2nd press on same day: user clicks "remembered" again -> MUST NOT jump to stage 4!
  const base2 = resolveBaseStateForDay({ word, todayLog });
  assert.equal(base2.stageBefore, 2);
  const t2 = computeReviewTransition({
    stageBefore: base2.stageBefore,
    reviewDate,
    result: 'remembered'
  });
  assert.equal(t2.stageAfter, 3);
  assert.equal(t2.nextReviewDateAfter, '2026-11-24');

  // 3rd press on same day: user changes mind to "familiar" -> computed from base stage 2 -> stage 1 (not 3 -> 2!)
  const base3 = resolveBaseStateForDay({ word, todayLog });
  const t3 = computeReviewTransition({
    stageBefore: base3.stageBefore,
    reviewDate,
    result: 'familiar'
  });
  assert.equal(t3.stageAfter, 1);
  assert.equal(t3.nextReviewDateAfter, '2026-11-11');
});

test('Daily example rotation stays 100% stable within the same day before and after button press', () => {
  const examples = [
    { en: 'Example sentence 1.', zh: '例句 1。' },
    { en: 'Example sentence 2.', zh: '例句 2。' },
    { en: 'Example sentence 3.', zh: '例句 3。' }
  ];

  // Word was due on 2026-11-08 (2 days overdue on 2026-11-10), pastReviewDays = 1
  const wordBeforePress = {
    id: 'crave-v-1',
    english: 'crave',
    ipa: '/kreɪv/',
    pos: 'v.',
    chinese_sense: '渴望',
    original_context: null,
    usage_notes: '比 want 强烈',
    examples_json: JSON.stringify(examples),
    stage: 1,
    next_review_date: '2026-11-08'
  };

  const cardBefore = formatWordCardForToday({
    word: wordBeforePress,
    todayLog: null,
    pastReviewDays: 1,
    today: '2026-11-10'
  });

  // (pastReviewDays=1 + overdueDays=2) % 3 = 0 -> Example 1
  assert.equal(cardBefore.example.index, 0);
  assert.equal(cardBefore.example.en, 'Example sentence 1.');
  assert.equal(cardBefore.example.label, EXAMPLE_LABEL);
  assert.equal(cardBefore.original_context, MISSING_CONTEXT_TEXT);

  // Now simulate user pressing "remembered" on 2026-11-10:
  // word.next_review_date becomes '2026-11-17', and todayLog has next_review_date_before = '2026-11-08'
  const wordAfterPress = {
    ...wordBeforePress,
    stage: 2,
    next_review_date: '2026-11-17'
  };
  const todayLogAfterPress = {
    word_id: 'crave-v-1',
    review_date: '2026-11-10',
    result: 'remembered',
    stage_before: 1,
    next_review_date_before: '2026-11-08',
    stage_after: 2,
    next_review_date_after: '2026-11-17',
    reviewed_at: '2026-11-10T08:15:00+08:00',
    press_count: 1
  };

  // Refreshing page on the same day 2026-11-10 MUST return the exact same example!
  const cardAfterRefresh = formatWordCardForToday({
    word: wordAfterPress,
    todayLog: todayLogAfterPress,
    pastReviewDays: 1,
    today: '2026-11-10'
  });
  assert.equal(cardAfterRefresh.example.index, cardBefore.example.index);
  assert.equal(cardAfterRefresh.example.en, cardBefore.example.en);

  // When next review arrives on 2026-11-17 (pastReviewDays is now 2, overdueDays is 0):
  // (2 + 0) % 3 = 2, guaranteed to rotate to a new example!
  const nextSessionEx = selectDailyExample({
    examples,
    pastReviewDays: 2,
    dueDateBeforeToday: '2026-11-17',
    today: '2026-11-17'
  });
  assert.equal(nextSessionEx.index, 2);
  assert.equal(nextSessionEx.en, 'Example sentence 3.');
});
