const MISSING_CONTEXT_TEXT = '原场景未提供';
const MISSING_NOTES_TEXT = '暂无辨析注解';
const EXAMPLE_LABEL = '示例';
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STAGE_DAYS = Object.freeze([1, 3, 7, 14, 30, 60]);
const MIN_STAGE = 0;
const MAX_STAGE = 5;

const RESULT_LABELS = {
  remembered: '记住了',
  familiar: '有点熟',
  forgotten: '忘了'
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatBeijingIso(ms = Date.now()) {
  const bj = new Date(ms + BEIJING_OFFSET_MS);
  const y = bj.getUTCFullYear();
  const m = pad2(bj.getUTCMonth() + 1);
  const d = pad2(bj.getUTCDate());
  const hh = pad2(bj.getUTCHours());
  const mm = pad2(bj.getUTCMinutes());
  const ss = pad2(bj.getUTCSeconds());
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}+08:00`;
}

export function addDaysDateString(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const baseMs = Date.UTC(y, m - 1, d);
  const target = new Date(baseMs + days * DAY_MS);
  const ty = target.getUTCFullYear();
  const tm = pad2(target.getUTCMonth() + 1);
  const td = pad2(target.getUTCDate());
  return `${ty}-${tm}-${td}`;
}

/**
 * Computes stage_after and next_review_date_after on the client from stage_before and result
 * using the exact same [1, 3, 7, 14, 30, 60] scheduling ladder as the backend.
 */
export function computeClientReviewTransition({ stageBefore, reviewDate, result }) {
  const base = Number.isInteger(Number(stageBefore))
    ? Math.max(MIN_STAGE, Math.min(MAX_STAGE, Number(stageBefore)))
    : MIN_STAGE;

  let stageAfter;
  let intervalDays;

  if (result === 'remembered') {
    stageAfter = Math.min(base + 1, MAX_STAGE);
    intervalDays = STAGE_DAYS[stageAfter];
  } else if (result === 'familiar') {
    stageAfter = Math.max(base - 1, MIN_STAGE);
    intervalDays = 1;
  } else {
    stageAfter = MIN_STAGE;
    intervalDays = 1;
  }

  return {
    stageBefore: base,
    stageAfter,
    intervalDays,
    nextReviewDateAfter: addDaysDateString(reviewDate, intervalDays)
  };
}

function getSyncedStorageKey(dateStr) {
  return `vocab_flashcards_receipts:${dateStr}`;
}

function getPendingStorageKey(dateStr) {
  return `vocab_flashcards_pending:${dateStr}`;
}

function loadMapFromStorage(win, key) {
  try {
    const raw = win.localStorage.getItem(key);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return new Map();
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function saveMapToStorage(win, key, map) {
  try {
    const obj = Object.fromEntries(map.entries());
    win.localStorage.setItem(key, JSON.stringify(obj));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Builds the fallback export JSON.
 * - Confirmed D1 entries are marked synced: true, sync_status: "synced".
 * - Pending retry entries (not yet saved to D1) have stage_after and next_review_date_after
 *   computed from stage_before and result via the exact scheduling ladder, and are explicitly
 *   marked synced: false, sync_status: "pending_retry".
 */
export function buildExportJson(
  dateStr,
  cards,
  receiptsMap,
  pendingRetriesMap = new Map(),
  nowMs = Date.now()
) {
  const results = [];
  let unsyncedCount = 0;

  for (const card of cards) {
    const pending = pendingRetriesMap?.get(card.id);
    const confirmed = receiptsMap?.get(card.id);

    if (pending) {
      unsyncedCount += 1;
      const stageBefore =
        card.stage_before_today ??
        pending.stage_before ??
        confirmed?.stage_before ??
        card.stage ??
        0;
      const dueBefore =
        card.next_review_date_before_today ??
        pending.next_review_date_before ??
        confirmed?.next_review_date_before ??
        card.next_review_date;
      const reviewDate = pending.review_date || dateStr;
      const calc = computeClientReviewTransition({
        stageBefore,
        reviewDate,
        result: pending.result
      });

      results.push({
        word_id: card.id,
        review_date: reviewDate,
        result: pending.result,
        stage_before: calc.stageBefore,
        next_review_date_before: dueBefore,
        stage_after: calc.stageAfter,
        next_review_date_after: calc.nextReviewDateAfter,
        reviewed_at: pending.reviewed_at || formatBeijingIso(nowMs),
        press_count: pending.press_count || 1,
        synced: false,
        sync_status: 'pending_retry'
      });
    } else if (confirmed) {
      results.push({
        word_id: confirmed.word_id || card.id,
        review_date: confirmed.review_date || dateStr,
        result: confirmed.result,
        stage_before: confirmed.stage_before,
        next_review_date_before: confirmed.next_review_date_before,
        stage_after: confirmed.stage_after,
        next_review_date_after: confirmed.next_review_date_after,
        reviewed_at: confirmed.reviewed_at,
        press_count: confirmed.press_count || 1,
        synced: true,
        sync_status: 'synced'
      });
    }
  }

  return JSON.stringify(
    {
      schema_version: 2,
      date: dateStr,
      exported_at: formatBeijingIso(nowMs),
      all_synced: unsyncedCount === 0,
      unsynced_count: unsyncedCount,
      results
    },
    null,
    2
  );
}

export function createFlashcardApp(doc = document, win = window) {
  const els = {
    reviewDate: doc.getElementById('review-date'),
    syncIndicator: doc.getElementById('sync-indicator'),
    btnPrevCard: doc.getElementById('btn-prev-card'),
    progressText: doc.getElementById('progress-text'),
    statusBanner: doc.getElementById('status-banner'),
    loadingView: doc.getElementById('loading-view'),
    emptyView: doc.getElementById('empty-view'),
    cardView: doc.getElementById('card-view'),
    doneView: doc.getElementById('done-view'),
    flashcard: doc.getElementById('flashcard'),
    cardFront: doc.getElementById('card-front'),
    cardBack: doc.getElementById('card-back'),
    wordPos: doc.getElementById('word-pos'),
    todayGradedBadge: doc.getElementById('today-graded-badge'),
    wordEnglish: doc.getElementById('word-english'),
    wordIpa: doc.getElementById('word-ipa'),
    flipHint: doc.getElementById('flip-hint'),
    wordChinese: doc.getElementById('word-chinese'),
    wordContext: doc.getElementById('word-context'),
    wordNotes: doc.getElementById('word-notes'),
    exampleLabel: doc.getElementById('example-label'),
    exampleEn: doc.getElementById('example-en'),
    exampleZh: doc.getElementById('example-zh'),
    actionBar: doc.getElementById('action-bar'),
    btnRemembered: doc.getElementById('btn-remembered'),
    btnFamiliar: doc.getElementById('btn-familiar'),
    btnForgotten: doc.getElementById('btn-forgotten'),
    doneSubtitle: doc.getElementById('done-subtitle'),
    statRemembered: doc.getElementById('stat-remembered'),
    statFamiliar: doc.getElementById('stat-familiar'),
    statForgotten: doc.getElementById('stat-forgotten'),
    btnCopyResults: doc.getElementById('btn-copy-results'),
    btnReviewCards: doc.getElementById('btn-review-cards'),
    copyFeedback: doc.getElementById('copy-feedback'),
    copyPreview: doc.getElementById('copy-preview')
  };

  const state = {
    sessionDate: '',
    cards: [],
    currentIndex: 0,
    isRevealed: false,
    isSubmitting: false,
    receiptsMap: new Map(), // 仅存已成功写入 D1 的确认记录
    pendingRetriesMap: new Map() // 仅存 POST /api/review 失败的“待重试”记录（绝不算进已完成）
  };

  function isCardSyncedAndComplete(card) {
    if (!card) return false;
    if (state.pendingRetriesMap.has(card.id)) {
      return false;
    }
    return Boolean(card.today_result || state.receiptsMap.has(card.id));
  }

  function showBanner(msg) {
    if (!msg) {
      els.statusBanner.hidden = true;
      els.statusBanner.textContent = '';
      return;
    }
    els.statusBanner.textContent = msg;
    els.statusBanner.hidden = false;
  }

  function showOnlyView(viewEl) {
    els.loadingView.hidden = viewEl !== els.loadingView;
    els.emptyView.hidden = viewEl !== els.emptyView;
    els.cardView.hidden = viewEl !== els.cardView;
    els.doneView.hidden = viewEl !== els.doneView;
  }

  function renderCurrentCard() {
    const total = state.cards.length;
    if (total === 0) {
      els.progressText.textContent = '0 / 0';
      els.btnPrevCard.hidden = true;
      showOnlyView(els.emptyView);
      return;
    }

    if (state.currentIndex >= total) {
      // 若仍有未同步到 D1 的待重试卡片，不允许误显示为“已完成”，跳回第一张待重试卡片
      const firstPendingIdx = state.cards.findIndex((c) => !isCardSyncedAndComplete(c));
      if (firstPendingIdx !== -1) {
        state.currentIndex = firstPendingIdx;
        state.isRevealed = Boolean(state.pendingRetriesMap.has(state.cards[firstPendingIdx].id));
      } else {
        renderDoneView();
        return;
      }
    }

    const card = state.cards[state.currentIndex];
    showOnlyView(els.cardView);

    els.progressText.textContent = `${state.currentIndex + 1} / ${total}`;
    els.btnPrevCard.hidden = state.currentIndex <= 0;

    // 正面内容：英文、带重音音标、词性
    els.wordEnglish.textContent = card.english || '';
    els.wordIpa.textContent = card.ipa || '';
    els.wordPos.textContent = card.pos || '';

    const pendingItem = state.pendingRetriesMap.get(card.id);
    const confirmedReceipt = state.receiptsMap.get(card.id);
    const syncedResult = confirmedReceipt?.result || card.today_result || null;

    if (pendingItem && RESULT_LABELS[pendingItem.result]) {
      els.todayGradedBadge.textContent = `待重试：${RESULT_LABELS[pendingItem.result]}（未同步）`;
      els.todayGradedBadge.hidden = false;
    } else if (syncedResult && RESULT_LABELS[syncedResult]) {
      els.todayGradedBadge.textContent = `今日已标：${RESULT_LABELS[syncedResult]}`;
      els.todayGradedBadge.hidden = false;
    } else {
      els.todayGradedBadge.textContent = '';
      els.todayGradedBadge.hidden = true;
    }

    // 背面内容：中文意思、原场景（无则显示“原场景未提供”）、辨析注解、标“示例”的例句
    els.wordChinese.textContent = card.chinese_sense || '';

    const rawContext = typeof card.original_context === 'string' ? card.original_context.trim() : '';
    const contextText = rawContext || MISSING_CONTEXT_TEXT;
    els.wordContext.textContent = contextText;
    els.wordContext.classList.toggle('is-missing', contextText === MISSING_CONTEXT_TEXT);

    const rawNotes = typeof card.usage_notes === 'string' ? card.usage_notes.trim() : '';
    els.wordNotes.textContent = rawNotes || MISSING_NOTES_TEXT;

    els.exampleLabel.textContent = card.example?.label || EXAMPLE_LABEL;
    els.exampleEn.textContent = card.example?.en || '';
    els.exampleZh.textContent = card.example?.zh || '';

    // 翻面与底部三按钮显隐控制：未翻开前必须隐藏背面与三个按钮
    els.cardBack.hidden = !state.isRevealed;
    els.actionBar.hidden = !state.isRevealed;
    els.flipHint.hidden = state.isRevealed;
    els.flashcard.setAttribute('aria-expanded', state.isRevealed ? 'true' : 'false');

    const highlightedResult = pendingItem?.result || syncedResult;
    for (const btn of [els.btnRemembered, els.btnFamiliar, els.btnForgotten]) {
      const btnResult = btn.getAttribute('data-result');
      btn.classList.toggle('is-selected', Boolean(highlightedResult && btnResult === highlightedResult));
      btn.disabled = state.isSubmitting;
    }
  }

  function renderDoneView() {
    const total = state.cards.length;
    showOnlyView(els.doneView);
    els.progressText.textContent = `${total} / ${total}`;
    els.btnPrevCard.hidden = true;

    let remembered = 0;
    let familiar = 0;
    let forgotten = 0;

    for (const card of state.cards) {
      const pending = state.pendingRetriesMap.get(card.id);
      const rec = state.receiptsMap.get(card.id);
      const res = pending?.result || rec?.result || card.today_result;
      if (res === 'remembered') remembered += 1;
      else if (res === 'familiar') familiar += 1;
      else if (res === 'forgotten') forgotten += 1;
    }

    const pendingCount = state.pendingRetriesMap.size;
    if (pendingCount > 0) {
      els.doneSubtitle.textContent = `注意：有 ${pendingCount} 张卡片尚未同步至云端（待重试），导出 JSON 中已按排期公式计算并标注 synced: false。`;
    } else {
      els.doneSubtitle.textContent = `今日共完成 ${total} 张到期生词卡片，排期与复习历史已全部写入云端 D1。`;
    }

    els.statRemembered.textContent = String(remembered);
    els.statFamiliar.textContent = String(familiar);
    els.statForgotten.textContent = String(forgotten);

    els.copyPreview.value = buildExportJson(
      state.sessionDate,
      state.cards,
      state.receiptsMap,
      state.pendingRetriesMap
    );
    els.copyFeedback.hidden = true;
  }

  function revealCard() {
    if (state.isRevealed || state.cards.length === 0 || state.currentIndex >= state.cards.length) {
      return;
    }
    state.isRevealed = true;
    renderCurrentCard();
  }

  async function postReviewToApi(wordId, result, dateStr) {
    const res = await win.fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word_id: wordId,
        result,
        date: dateStr
      })
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.redirected || !contentType.includes('application/json')) {
      throw new Error('登录状态可能已过期（Cloudflare Access），请刷新页面重新验证。');
    }

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `提交失败 (HTTP ${res.status})`);
    }
    return data.review;
  }

  function applyConfirmedReceipt(card, receipt) {
    card.today_result = receipt.result;
    card.stage = receipt.stage_after;
    card.next_review_date = receipt.next_review_date_after;

    const syncedReceipt = {
      ...receipt,
      synced: true,
      sync_status: 'synced'
    };
    state.receiptsMap.set(card.id, syncedReceipt);
    state.pendingRetriesMap.delete(card.id);

    saveMapToStorage(win, getSyncedStorageKey(state.sessionDate), state.receiptsMap);
    saveMapToStorage(win, getPendingStorageKey(state.sessionDate), state.pendingRetriesMap);
  }

  /**
   * Automatically retries any pending (unsynced) submissions stored on this device.
   */
  async function retryPendingSubmissions() {
    if (state.pendingRetriesMap.size === 0) return { retried: 0, remaining: 0 };

    let retried = 0;
    for (const card of state.cards) {
      const pending = state.pendingRetriesMap.get(card.id);
      if (!pending) continue;

      try {
        const receipt = await postReviewToApi(card.id, pending.result, state.sessionDate);
        applyConfirmedReceipt(card, receipt);
        retried += 1;
      } catch {
        // 仍然失败则保留在 pendingRetriesMap 中，等待用户手动重试
      }
    }
    return {
      retried,
      remaining: state.pendingRetriesMap.size
    };
  }

  async function handleGradeClick(result) {
    if (!state.isRevealed || state.isSubmitting) return;
    const card = state.cards[state.currentIndex];
    if (!card) return;

    state.isSubmitting = true;
    els.syncIndicator.hidden = false;
    showBanner('');
    renderCurrentCard();

    try {
      const receipt = await postReviewToApi(card.id, result, state.sessionDate);
      applyConfirmedReceipt(card, receipt);

      state.isSubmitting = false;
      els.syncIndicator.hidden = true;
      state.currentIndex += 1;
      state.isRevealed = false;
      renderCurrentCard();
    } catch (err) {
      // 未成功写入 D1：仅作为“待重试”暂存，按 stage_before 和排期公式算出新档位与日期，
      // 绝不算进已完成，且继续停留在当前卡片提示重试！
      const stageBefore =
        card.stage_before_today ??
        state.receiptsMap.get(card.id)?.stage_before ??
        state.pendingRetriesMap.get(card.id)?.stage_before ??
        card.stage ??
        0;
      const dueBefore =
        card.next_review_date_before_today ??
        state.receiptsMap.get(card.id)?.next_review_date_before ??
        state.pendingRetriesMap.get(card.id)?.next_review_date_before ??
        card.next_review_date;

      const calc = computeClientReviewTransition({
        stageBefore,
        reviewDate: state.sessionDate,
        result
      });

      const prevCount =
        state.pendingRetriesMap.get(card.id)?.press_count ||
        state.receiptsMap.get(card.id)?.press_count ||
        0;

      const pendingReceipt = {
        word_id: card.id,
        review_date: state.sessionDate,
        result,
        stage_before: calc.stageBefore,
        next_review_date_before: dueBefore,
        stage_after: calc.stageAfter,
        next_review_date_after: calc.nextReviewDateAfter,
        reviewed_at: formatBeijingIso(),
        press_count: prevCount + 1,
        synced: false,
        sync_status: 'pending_retry'
      };

      state.pendingRetriesMap.set(card.id, pendingReceipt);
      saveMapToStorage(win, getPendingStorageKey(state.sessionDate), state.pendingRetriesMap);

      state.isSubmitting = false;
      els.syncIndicator.hidden = true;
      showBanner(
        `云端保存未成功：${err.message}（已作为「待重试：${RESULT_LABELS[result]}」暂存，未计入完成，请再次点击按钮重试）`
      );
      renderCurrentCard();
    }
  }

  async function copyResultsToClipboard() {
    const jsonText = buildExportJson(
      state.sessionDate,
      state.cards,
      state.receiptsMap,
      state.pendingRetriesMap
    );
    els.copyPreview.value = jsonText;

    try {
      if (win.navigator?.clipboard?.writeText) {
        await win.navigator.clipboard.writeText(jsonText);
      } else {
        els.copyPreview.focus();
        els.copyPreview.select();
        doc.execCommand('copy');
      }
      const pendingCount = state.pendingRetriesMap.size;
      els.copyFeedback.textContent =
        pendingCount > 0
          ? `已复制今日结果 JSON（含 ${pendingCount} 条尚未同步的待重试记录，已按公式算好新档位并标出 synced: false）。`
          : '已复制今日结果 JSON，可直接粘贴备份或发给词库助手。';
      els.copyFeedback.hidden = false;
    } catch {
      els.copyFeedback.textContent = '请展开下方明细框手动全选复制。';
      els.copyFeedback.hidden = false;
    }
  }

  async function init() {
    showBanner('');
    showOnlyView(els.loadingView);

    try {
      const search = win.location?.search || '';
      const params = new URLSearchParams(search);
      const dateQuery = params.get('date');
      const apiUrl = dateQuery
        ? `/api/today?date=${encodeURIComponent(dateQuery)}`
        : '/api/today';

      const res = await win.fetch(apiUrl, {
        headers: { Accept: 'application/json' }
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.redirected || !contentType.includes('application/json')) {
        throw new Error('登录状态可能已过期（Cloudflare Access），请刷新页面重新登录。');
      }

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `加载失败 (HTTP ${res.status})`);
      }

      state.sessionDate = data.date;
      state.cards = Array.isArray(data.cards) ? data.cards : [];
      state.receiptsMap = new Map();

      // 仅将服务端 D1 真实已确认的记录写入 receiptsMap（未写入 D1 的卡片绝不算作已完成）
      if (Array.isArray(data.results)) {
        for (const rec of data.results) {
          state.receiptsMap.set(rec.word_id, {
            ...rec,
            synced: true,
            sync_status: 'synced'
          });
        }
      }
      saveMapToStorage(win, getSyncedStorageKey(state.sessionDate), state.receiptsMap);

      // 读取本机暂存的“待重试”记录，并在页面加载时自动尝试重传一次
      state.pendingRetriesMap = loadMapFromStorage(win, getPendingStorageKey(state.sessionDate));
      if (state.pendingRetriesMap.size > 0) {
        await retryPendingSubmissions();
      }

      els.reviewDate.textContent = state.sessionDate;

      // 定位到第一张尚未同步完成的卡片（包含从未按过的卡片，或仍处于“待重试”状态的卡片）
      const firstIncompleteIdx = state.cards.findIndex((c) => !isCardSyncedAndComplete(c));
      state.currentIndex = firstIncompleteIdx === -1 ? state.cards.length : firstIncompleteIdx;

      const currentCard = state.cards[state.currentIndex];
      const pendingForCurrent = currentCard ? state.pendingRetriesMap.get(currentCard.id) : null;
      if (pendingForCurrent) {
        // 若停留在待重试卡片上，自动翻开并提示用户重试
        state.isRevealed = true;
        showBanner(
          `上次点击「${RESULT_LABELS[pendingForCurrent.result] || pendingForCurrent.result}」尚未写入云端 D1（待重试），请点击下方按钮重试。`
        );
      } else {
        state.isRevealed = false;
      }

      renderCurrentCard();
    } catch (err) {
      showBanner(err.message || '加载今日生词失败，请检查网络后刷新重试。');
      els.loadingView.innerHTML = '<p class="state-desc">暂时无法读取今日卡片，请刷新页面重试。</p>';
    }
  }

  // 绑定事件
  els.flashcard.addEventListener('click', (e) => {
    if (!state.isRevealed) {
      e.preventDefault();
      revealCard();
    }
  });

  els.flashcard.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !state.isRevealed) {
      e.preventDefault();
      revealCard();
    }
  });

  for (const btn of [els.btnRemembered, els.btnFamiliar, els.btnForgotten]) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const result = btn.getAttribute('data-result');
      handleGradeClick(result);
    });
  }

  els.btnPrevCard.addEventListener('click', () => {
    if (state.currentIndex > 0 && !state.isSubmitting) {
      state.currentIndex -= 1;
      state.isRevealed = false;
      renderCurrentCard();
    }
  });

  els.btnReviewCards.addEventListener('click', () => {
    if (state.cards.length > 0) {
      state.currentIndex = 0;
      state.isRevealed = false;
      renderCurrentCard();
    }
  });

  els.btnCopyResults.addEventListener('click', () => {
    copyResultsToClipboard();
  });

  return {
    state,
    init,
    revealCard,
    handleGradeClick,
    retryPendingSubmissions,
    copyResultsToClipboard,
    renderCurrentCard
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__DISABLE_AUTO_INIT__) {
  createFlashcardApp(document, window).init();
}
