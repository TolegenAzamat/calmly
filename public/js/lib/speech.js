// Browser speech: recognition (speech to text) and synthesis (text to speech).
// Both are free and built in. Recognition works best in Chrome and Edge.

import { LONG_PAUSE_MS } from './metrics.js';

const SpeechRecognitionImpl =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const canRecognize = Boolean(SpeechRecognitionImpl);
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

export const MIC_ERRORS = {
  'not-allowed': 'The microphone is blocked. Allow it in your browser’s site settings, or type your answer below.',
  'service-not-allowed': 'This browser does not allow speech recognition here. Type your answer below, or try Chrome.',
  'audio-capture': 'No microphone was found. Check that one is connected, or type your answer below.',
  network: 'The browser’s speech service cannot be reached. Check your connection, or type your answer below.',
  restart_loop: 'Speech recognition keeps stopping. Type your answer below, or reload the page.',
  start_failed: 'The microphone could not start. Type your answer below, or reload the page.',
};

export class Recognizer {
  constructor({ onInterim, onFatal } = {}) {
    this.onInterim = onInterim ?? (() => {});
    this.onFatal = onFatal ?? (() => {});
    this.rec = null;
    this.running = false;
    this.active = false;
    this.resetState();
  }

  resetState() {
    this.finalText = '';
    this.interimText = '';
    this.startedAt = 0;
    this.firstSpeechAt = 0;
    this.lastSpeechAt = 0;
    this.longPauses = 0;
    this.restarts = [];
    this.fatal = false;
    this.stopResolver = null;
  }

  start() {
    if (!SpeechRecognitionImpl) throw new Error('unsupported');
    this.resetState();
    this.active = true;
    this.startedAt = performance.now();
    this.spawn();
  }

  spawn() {
    const rec = new SpeechRecognitionImpl();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => this.handleResult(event);
    rec.onerror = (event) => this.handleError(event);
    rec.onend = () => this.handleEnd();
    this.rec = rec;
    try {
      rec.start();
      this.running = true;
    } catch {
      this.fail('start_failed');
    }
  }

  combined() {
    return [this.finalText, this.interimText].filter(Boolean).join(' ');
  }

  handleResult(event) {
    const now = performance.now();
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const piece = result[0]?.transcript ?? '';
      if (result.isFinal) {
        this.finalText += (this.finalText ? ' ' : '') + piece.trim();
      } else {
        interim += piece;
      }
    }
    this.interimText = interim.trim();
    if (this.combined()) {
      if (!this.firstSpeechAt) {
        this.firstSpeechAt = now;
      } else if (now - this.lastSpeechAt > LONG_PAUSE_MS) {
        this.longPauses += 1;
      }
      this.lastSpeechAt = now;
    }
    this.onInterim(this.combined());
  }

  handleError(event) {
    // Silence and our own aborts are normal: handleEnd decides whether to restart.
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    this.fail(event.error);
  }

  fail(code) {
    this.fatal = true;
    this.active = false;
    this.onFatal(code, this.result());
  }

  handleEnd() {
    this.running = false;
    if (this.active && !this.fatal) {
      // Browsers end recognition after a few quiet seconds. Keep listening until the user taps stop.
      const now = performance.now();
      this.restarts = this.restarts.filter((t) => now - t < 4000);
      this.restarts.push(now);
      if (this.restarts.length > 6) {
        this.fail('restart_loop');
      } else {
        setTimeout(() => {
          if (this.active && !this.fatal) this.spawn();
        }, 120);
        return;
      }
    }
    this.settle();
  }

  settle() {
    this.active = false;
    if (this.stopResolver) {
      const resolve = this.stopResolver;
      this.stopResolver = null;
      resolve(this.result());
    }
  }

  stop() {
    return new Promise((resolve) => {
      this.stopResolver = resolve;
      this.active = false;
      if (!this.running) {
        this.settle();
        return;
      }
      try {
        this.rec.stop();
      } catch {
        this.settle();
        return;
      }
      setTimeout(() => this.settle(), 2500); // safety net if onend never fires
    });
  }

  cancel() {
    this.active = false;
    this.stopResolver = null;
    try {
      this.rec?.abort();
    } catch {
      // already stopped
    }
  }

  result() {
    const speakingSec = this.firstSpeechAt
      ? Math.max((this.lastSpeechAt - this.firstSpeechAt) / 1000 + 0.6, 0.6)
      : 0;
    const latencySec = this.firstSpeechAt
      ? Math.max((this.firstSpeechAt - this.startedAt) / 1000, 0)
      : null;
    return { text: this.combined().trim(), speakingSec, latencySec, longPauses: this.longPauses };
  }
}

// ---------------------------------------------------------------- speaking
const PREFERRED_VOICES = ['Google US English', 'Samantha', 'Aria', 'Jenny', 'Natural', 'Google UK English Female'];

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((v) => /^en[-_]/i.test(v.lang));
  for (const name of PREFERRED_VOICES) {
    const found = english.find((v) => v.name.includes(name));
    if (found) return found;
  }
  return english.find((v) => /^en[-_]US/i.test(v.lang)) ?? english[0] ?? null;
}

// iOS Safari only allows speech after a tap, so call this from a click handler once.
export function unlockSpeech() {
  if (!canSpeak) return;
  try {
    const silent = new SpeechSynthesisUtterance(' ');
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  } catch {
    // not available
  }
}

export function speak(text, { rate = 0.95 } = {}) {
  return new Promise((resolve) => {
    if (!canSpeak) {
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    const voice = pickVoice();
    if (voice) utterance.voice = voice;

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    utterance.onend = done;
    utterance.onerror = done;
    // Some browsers never fire onend, so never wait longer than the text could take.
    setTimeout(done, Math.min(25_000, 2000 + text.length * 100));
    setTimeout(() => synth.speak(utterance), 60);
  });
}

export function stopSpeaking() {
  if (canSpeak) window.speechSynthesis.cancel();
}
