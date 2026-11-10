const MISSING_CONTEXT_TEXT = '原场景未提供';
const MISSING_NOTES_TEXT = '暂无辨析注解';
const EXAMPLE_LABEL = '示例';
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

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

function getStorageKey(dateStr) {
  return `vocab_flashcards_receipts:${dateStr}`;
}

function loadLocalReceipts(dateStr) {
  try {
    const raw = window.localStorage.getItem(getStorageKey(dateStr));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveLocalReceipts(dateStr, receiptsMap) {
  try {
    const obj = Object.fromEntries(receiptsMap.entries());
    window.localStorage.setItem(getStorageKey(dateStr), JSON.stringify(obj));
  } catch {
    // Ignore storage quota errors
  }
}

export function buildExportJson(dateStr, cards, receiptsMap, nowMs = Date.now()) {
  const results = [];
  for (const card of cards) {
    const rec = receiptsMap.get(card.id);
    if (rec) {
      results.push({
        word_id: rec.word_id,
        review_date: rec.review_date || dateStr,
        result: rec.result,
        stage_before: rec.stage_before,
        next_review_date_before: rec.next_review_date_before,
        stage_after: rec.stage_after,
        next_review_date_after: rec.next_review_date_after,
        reviewed_at: rec.reviewed_at,
        press_count: rec.press_count || 1
      });
    }
  }
  return JSON.stringify(
    {
      schema_version: 2,
      date: dateStr,
      exported_at: formatBeijingIso(nowMs),
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
    receiptsMap: new Map()
  };

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
      renderDoneView();
      return;
    }

    const card = state.cards[state.currentIndex];
    showOnlyView(els.cardView);

    els.progressText.textContent = `${state.currentIndex + 1} / ${total}`;
    els.btnPrevCard.hidden = state.currentIndex <= 0;

    // 正面内容：英文、带重音音标、词性
    els.wordEnglish.textContent = card.english || '';
    els.wordIpa.textContent = card.ipa || '';
    els.wordPos.textContent = card.pos || '';

    const existingReceipt = state.receiptsMap.get(card.id);
    const effectiveResult = existingReceipt?.result || card.today_result || null;
    if (effectiveResult && RESULT_LABELS[effectiveResult]) {
      els.todayGradedBadge.textContent = `今日已标：${RESULT_LABELS[effectiveResult]}`;
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

    // 高亮今日已选按钮（若是在回看/修改今日已按过的卡片）
    for (const btn of [els.btnRemembered, els.btnFamiliar, els.btnForgotten]) {
      const btnResult = btn.getAttribute('data-result');
      btn.classList.toggle('is-selected', Boolean(effectiveResult && btnResult === effectiveResult));
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
      const rec = state.receiptsMap.get(card.id);
      const res = rec?.result || card.today_result;
      if (res === 'remembered') remembered += 1;
      else if (res === 'familiar') familiar += 1;
      else if (res === 'forgotten') forgotten += 1;
    }

    els.doneSubtitle.textContent = `今日共完成 ${total} 张到期生词卡片，排期与复习历史已同步更新。`;
    els.statRemembered.textContent = String(remembered);
    els.statFamiliar.textContent = String(familiar);
    els.statForgotten.textContent = String(forgotten);

    els.copyPreview.value = buildExportJson(state.sessionDate, state.cards, state.receiptsMap);
    els.copyFeedback.hidden = true;
  }

  function revealCard() {
    if (state.isRevealed || state.cards.length === 0 || state.currentIndex >= state.cards.length) {
      return;
    }
    state.isRevealed = true;
    renderCurrentCard();
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
      const res = await win.fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word_id: card.id,
          result,
          date: state.sessionDate
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

      const receipt = data.review;
      card.today_result = receipt.result;
      card.stage = receipt.stage_after;
      card.next_review_date = receipt.next_review_date_after;
      state.receiptsMap.set(card.id, receipt);
      saveLocalReceipts(state.sessionDate, state.receiptsMap);

      state.isSubmitting = false;
      els.syncIndicator.hidden = true;
      state.currentIndex += 1;
      state.isRevealed = false;
      renderCurrentCard();
    } catch (err) {
      // 网络或鉴权异常时，仍将选择暂存到本地缓存，提示用户重试或用完成页复制兜底
      const fallbackReceipt = {
        word_id: card.id,
        review_date: state.sessionDate,
        result,
        stage_before: card.stage_before_today ?? card.stage,
        next_review_date_before: card.next_review_date_before_today ?? card.next_review_date,
        stage_after: card.stage,
        next_review_date_after: card.next_review_date,
        reviewed_at: formatBeijingIso(),
        press_count: (state.receiptsMap.get(card.id)?.press_count || 0) + 1
      };
      state.receiptsMap.set(card.id, fallbackReceipt);
      saveLocalReceipts(state.sessionDate, state.receiptsMap);

      state.isSubmitting = false;
      els.syncIndicator.hidden = true;
      showBanner(`自动保存未成功：${err.message}（结果已暂存至本机，可稍后重试或复制结果兜底）`);
      renderCurrentCard();
    }
  }

  async function copyResultsToClipboard() {
    const jsonText = buildExportJson(state.sessionDate, state.cards, state.receiptsMap);
    els.copyPreview.value = jsonText;

    try {
      if (win.navigator?.clipboard?.writeText) {
        await win.navigator.clipboard.writeText(jsonText);
      } else {
        els.copyPreview.focus();
        els.copyPreview.select();
        doc.execCommand('copy');
      }
      els.copyFeedback.textContent = '已复制今日结果 JSON，可直接粘贴备份或发给词库助手。';
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

      // 先载入本机缓存，再用服务端 D1 真实已存结果覆盖
      const localCached = loadLocalReceipts(state.sessionDate);
      for (const [wordId, rec] of Object.entries(localCached)) {
        state.receiptsMap.set(wordId, rec);
      }
      if (Array.isArray(data.results)) {
        for (const rec of data.results) {
          state.receiptsMap.set(rec.word_id, rec);
        }
      }
      saveLocalReceipts(state.sessionDate, state.receiptsMap);

      els.reviewDate.textContent = state.sessionDate;

      // 自动定位到第一张今天尚未按过的卡片；若全部已按完则直接进入今日完成页
      const firstUnreviewedIdx = state.cards.findIndex(
        (c) => !c.today_result && !state.receiptsMap.has(c.id)
      );
      state.currentIndex = firstUnreviewedIdx === -1 ? state.cards.length : firstUnreviewedIdx;
      state.isRevealed = false;
      renderCurrentCard();
    } catch (err) {
      showBanner(err.message || '加载今日生词失败，请检查网络后刷新重试。');
      els.loadingView.innerHTML = '<p class="state-desc">暂时无法读取今日卡片，请刷新页面重试。</p>';
    }
  }

  // 绑定事件
  els.flashcard.addEventListener('click', (e) => {
    // 若已翻开，避免用户选中文本复制时重复触发
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
    copyResultsToClipboard,
    renderCurrentCard
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__DISABLE_AUTO_INIT__) {
  createFlashcardApp(document, window).init();
}
