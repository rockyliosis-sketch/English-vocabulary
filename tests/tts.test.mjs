import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSpeakableText,
  pickEnglishVoice,
  createSpeechController,
  TTS_UNSUPPORTED_MSG,
  TTS_FAILED_MSG
} from '../public/app.js';

function createMockSpeechEnv({ voices = [], throwOnSpeak = false } = {}) {
  const spoken = [];
  let cancelCount = 0;
  let currentVoices = voices;
  const listeners = new Map();

  class MockUtterance {
    constructor(text) {
      this.text = text;
      this.lang = '';
      this.rate = 1;
      this.voice = null;
      this.onend = null;
      this.onerror = null;
    }
  }

  const speechSynthesis = {
    speaking: false,
    pending: false,
    getVoices() {
      return currentVoices;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    cancel() {
      cancelCount += 1;
      const last = spoken[spoken.length - 1];
      this.speaking = false;
      this.pending = false;
      if (last && typeof last.onerror === 'function') {
        last.onerror({ error: 'canceled' });
      }
    },
    speak(utterance) {
      if (throwOnSpeak) {
        throw new Error('Speech synthesis blocked');
      }
      this.speaking = true;
      spoken.push(utterance);
    }
  };

  return {
    win: {
      speechSynthesis,
      SpeechSynthesisUtterance: MockUtterance
    },
    spoken,
    getCancelCount: () => cancelCount,
    setVoices(nextVoices) {
      currentVoices = nextVoices;
      for (const fn of listeners.get('voiceschanged') || []) {
        fn();
      }
    },
    finishLast() {
      speechSynthesis.speaking = false;
      const last = spoken[spoken.length - 1];
      last?.onend?.();
    },
    failLast(errorCode = 'synthesis-failed') {
      speechSynthesis.speaking = false;
      const last = spoken[spoken.length - 1];
      last?.onerror?.({ error: errorCode });
    }
  };
}

test('pickEnglishVoice prefers en-US local/default, falls back to en-*, then null', () => {
  const zh = { name: 'Ting-Ting', lang: 'zh-CN', localService: true, default: true };
  const enGb = { name: 'Daniel', lang: 'en-GB', localService: true, default: false };
  const enUsRemote = { name: 'Google US', lang: 'en-US', localService: false, default: false };
  const enUsLocal = { name: 'Samantha', lang: 'en_US', localService: true, default: false };
  const enUsLocalDefault = { name: 'Ava', lang: 'en-US', localService: true, default: true };

  assert.equal(pickEnglishVoice([]), null);
  assert.equal(pickEnglishVoice([zh]), null);
  assert.equal(pickEnglishVoice([zh, enGb]), enGb);
  assert.equal(pickEnglishVoice([zh, enGb, enUsRemote]), enUsRemote);
  assert.equal(pickEnglishVoice([zh, enUsRemote, enUsLocal]), enUsLocal);
  assert.equal(pickEnglishVoice([zh, enUsLocal, enUsLocalDefault]), enUsLocalDefault);
});

test('getSpeakableText trims valid text and rejects empty or missing-context sentinel', () => {
  assert.equal(getSpeakableText('  arrange  '), 'arrange');
  assert.equal(getSpeakableText('   '), '');
  assert.equal(getSpeakableText(null), '');
  assert.equal(getSpeakableText('原场景未提供', '原场景未提供'), '');
  assert.equal(getSpeakableText('  原场景未提供  ', '原场景未提供'), '');
  assert.equal(getSpeakableText('We arranged a meeting.', '原场景未提供'), 'We arranged a meeting.');
});

test('createSpeechController handles voiceschanged, idle speak without spurious cancel, toggle stop, and switch cancel+speak', () => {
  const env = createMockSpeechEnv({ voices: [] });
  const states = [];
  const notices = [];
  const ctrl = createSpeechController(env.win, {
    onStateChange: (k) => states.push(k),
    onNotice: (m) => notices.push(m)
  });

  // Simulate iOS Safari populating voices asynchronously via voiceschanged
  const samantha = { name: 'Samantha', lang: 'en-US', localService: true, default: true };
  env.setVoices([samantha]);

  // Idle speak: must NOT call cancel() unnecessarily, uses en-US and rate 0.9
  const r1 = ctrl.speak('word', 'arrange');
  assert.equal(r1.ok, true);
  assert.equal(r1.action, 'speaking');
  assert.equal(env.getCancelCount(), 0);
  assert.equal(env.spoken.length, 1);
  assert.equal(env.spoken[0].text, 'arrange');
  assert.equal(env.spoken[0].lang, 'en-US');
  assert.equal(env.spoken[0].rate, 0.9);
  assert.equal(env.spoken[0].voice, samantha);
  assert.equal(ctrl.getActiveKey(), 'word');

  // Clicking a different target cancels the previous utterance without surfacing an error notice
  const r2 = ctrl.speak('example', 'Let me arrange a taxi for you.');
  assert.equal(r2.ok, true);
  assert.equal(r2.action, 'speaking');
  assert.equal(env.getCancelCount(), 1);
  assert.equal(env.spoken.length, 2);
  assert.equal(env.spoken[1].text, 'Let me arrange a taxi for you.');
  assert.equal(ctrl.getActiveKey(), 'example');
  assert.ok(!notices.includes(TTS_FAILED_MSG));

  // Clicking the same active target stops playback
  const r3 = ctrl.speak('example', 'Let me arrange a taxi for you.');
  assert.equal(r3.ok, true);
  assert.equal(r3.action, 'stopped');
  assert.equal(env.getCancelCount(), 2);
  assert.equal(ctrl.getActiveKey(), null);
  assert.equal(states[states.length - 1], null);
  assert.ok(!notices.includes(TTS_FAILED_MSG));
});

test('createSpeechController ignores empty/missing text and degrades gracefully when unsupported or speaking fails', () => {
  const notices = [];
  const unsupportedCtrl = createSpeechController({}, {
    onNotice: (m) => notices.push(m)
  });

  // Empty or sentinel text is a silent no-op even on unsupported browsers
  assert.deepEqual(unsupportedCtrl.speak('context', '', { missingSentinel: '原场景未提供' }), {
    ok: false,
    reason: 'empty'
  });
  assert.deepEqual(unsupportedCtrl.speak('context', '原场景未提供', { missingSentinel: '原场景未提供' }), {
    ok: false,
    reason: 'empty'
  });
  assert.equal(notices.length, 0);

  // Valid text on unsupported browser shows gentle notice without throwing
  const rUnsupported = unsupportedCtrl.speak('word', 'arrange');
  assert.deepEqual(rUnsupported, { ok: false, reason: 'unsupported' });
  assert.equal(notices[notices.length - 1], TTS_UNSUPPORTED_MSG);

  // Exception thrown by synth.speak shows non-blocking failure notice
  const failNotices = [];
  const envThrow = createMockSpeechEnv({ throwOnSpeak: true });
  const throwCtrl = createSpeechController(envThrow.win, {
    onNotice: (m) => failNotices.push(m)
  });
  const rThrow = throwCtrl.speak('word', 'arrange');
  assert.deepEqual(rThrow, { ok: false, reason: 'error' });
  assert.equal(failNotices[failNotices.length - 1], TTS_FAILED_MSG);
  assert.equal(throwCtrl.getActiveKey(), null);

  // Non-canceled async error event surfaces failure notice
  const errNotices = [];
  const envErr = createMockSpeechEnv();
  const errCtrl = createSpeechController(envErr.win, {
    onNotice: (m) => errNotices.push(m)
  });
  errCtrl.speak('word', 'arrange');
  envErr.failLast('audio-busy');
  assert.equal(errNotices[errNotices.length - 1], TTS_FAILED_MSG);
  assert.equal(errCtrl.getActiveKey(), null);
});
