import { ref, computed, onMounted, onBeforeUnmount, nextTick } from '../lib/vue.js';
import { fetchReply, fetchHint } from '../lib/api.js';
import { countWords } from '../lib/metrics.js';
import {
  Recognizer, canRecognize, canSpeak, speak, stopSpeaking, MIC_ERRORS,
} from '../lib/speech.js';

const NUDGES = [
  'Pauses are normal. Take your time.',
  'One clear idea is enough for an answer.',
  'Imperfect English is still real communication.',
  'You can say “Let me think for a moment” and breathe.',
  'Mistakes will show up in your review at the end, not now.',
];

export default {
  name: 'SessionScreen',
  props: {
    scenario: { type: Object, required: true },
    profile: { type: Object, required: true },
    context: { type: String, default: '' },
  },
  emits: ['finish', 'exit'],
  setup(props, { emit }) {
    const messages = ref([]);
    const turns = ref([]);
    const phase = ref('loading'); // loading | speaking | idle | listening | transcribing
    const interim = ref('');
    const draft = ref('');
    const error = ref('');
    const needsRetry = ref(false);
    const hint = ref(null);
    const hintLoading = ref(false);
    const ttsOn = ref(canSpeak);
    const suggestFinish = ref(false);
    const hintsUsed = ref(0);
    const redos = ref(0);
    const chatEl = ref(null);

    let nextId = 1;
    let speakToken = 0;
    let abortController = null;

    const recognizer = canRecognize
      ? new Recognizer({
          onInterim: (text) => { interim.value = text; },
          onFatal: handleMicFatal,
        })
      : null;

    const makeMessage = (role, content, via) => ({ id: nextId++, role, content, via });
    const wire = () => messages.value.map(({ role, content }) => ({ role, content }));
    const scrollSoon = () => nextTick(() => {
      if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight;
    });

    const lastIsCoach = computed(() => messages.value.at(-1)?.role === 'assistant');
    const canHint = computed(() => lastIsCoach.value && phase.value === 'idle' && !hintLoading.value);
    const canRedo = computed(() => turns.value.length > 0 && phase.value === 'idle');
    const nudge = computed(() => NUDGES[turns.value.length % NUDGES.length]);
    const micDisabled = computed(() => !['idle', 'speaking', 'listening'].includes(phase.value));
    const micLabel = computed(() =>
      phase.value === 'listening' ? 'Stop and send my answer' : 'Start speaking');
    const statusText = computed(() => {
      switch (phase.value) {
        case 'loading': return 'The coach is thinking…';
        case 'speaking': return 'The coach is speaking. Tap the microphone to skip ahead.';
        case 'listening': return 'Listening. Tap the microphone when you are done.';
        case 'transcribing': return 'Got it…';
        default: return canRecognize
          ? 'Your turn. Tap the microphone and speak, or type below.'
          : 'Your turn. Type your answer below.';
      }
    });

    async function deliver(text) {
      if (!ttsOn.value || !canSpeak) {
        phase.value = 'idle';
        return;
      }
      const token = ++speakToken;
      phase.value = 'speaking';
      await speak(text);
      if (token === speakToken) phase.value = 'idle';
    }

    function skipSpeech() {
      speakToken += 1;
      stopSpeaking();
      if (phase.value === 'speaking') phase.value = 'idle';
    }

    async function requestReply() {
      error.value = '';
      needsRetry.value = false;
      hint.value = null;
      phase.value = 'loading';
      abortController = new AbortController();
      try {
        const data = await fetchReply({
          scenario: props.scenario.id,
          context: props.context,
          lang: props.profile.lang,
          name: props.profile.name,
          messages: wire(),
        }, { signal: abortController.signal });
        messages.value.push(makeMessage('assistant', data.reply));
        suggestFinish.value = Boolean(data.suggestFinish);
        scrollSoon();
        await deliver(data.reply);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        error.value = err?.message || 'Something went wrong. Try again.';
        needsRetry.value = true;
        phase.value = 'idle';
      }
    }

    async function sendAnswer(text, meta) {
      messages.value.push(makeMessage('user', text, meta.via));
      turns.value.push({
        text,
        via: meta.via,
        words: countWords(text),
        speakingSec: meta.speakingSec ?? null,
        latencySec: meta.latencySec ?? null,
        longPauses: meta.longPauses ?? 0,
      });
      scrollSoon();
      await requestReply();
    }

    function startListening() {
      error.value = '';
      draft.value = '';
      interim.value = '';
      try {
        recognizer.start();
        phase.value = 'listening';
      } catch {
        error.value = MIC_ERRORS.start_failed;
      }
    }

    async function stopListeningAndSend() {
      phase.value = 'transcribing';
      const result = await recognizer.stop();
      interim.value = '';
      const text = result.text.trim();
      if (!text) {
        phase.value = 'idle';
        error.value = 'I did not catch anything. Try again, or type your answer below.';
        return;
      }
      await sendAnswer(text, {
        via: 'voice',
        speakingSec: result.speakingSec,
        latencySec: result.latencySec,
        longPauses: result.longPauses,
      });
    }

    function handleMicFatal(code, result) {
      error.value = MIC_ERRORS[code] ?? 'The microphone stopped working. Type your answer below.';
      // Never lose what the person already said: put it in the text box to edit and send.
      if (result?.text) draft.value = result.text;
      interim.value = '';
      if (phase.value === 'listening' || phase.value === 'transcribing') phase.value = 'idle';
    }

    async function toggleMic() {
      if (!recognizer) return;
      if (phase.value === 'listening') {
        await stopListeningAndSend();
        return;
      }
      if (phase.value === 'speaking') skipSpeech();
      if (phase.value === 'idle') startListening();
    }

    function submitDraft() {
      const text = draft.value.trim();
      if (!text || !['idle', 'speaking'].includes(phase.value)) return;
      if (phase.value === 'speaking') skipSpeech();
      draft.value = '';
      sendAnswer(text, { via: 'text' });
    }

    function redoLastAnswer() {
      if (!canRedo.value) return;
      if (messages.value.at(-1)?.role === 'assistant') messages.value.pop();
      if (messages.value.at(-1)?.role === 'user') {
        messages.value.pop();
        turns.value.pop();
      }
      redos.value += 1;
      error.value = '';
      needsRetry.value = false;
      hint.value = null;
      suggestFinish.value = false;
      const question = messages.value.at(-1);
      if (question?.role === 'assistant') deliver(question.content);
    }

    async function showHint() {
      if (!canHint.value) return;
      hintLoading.value = true;
      error.value = '';
      try {
        const data = await fetchHint({
          scenario: props.scenario.id,
          context: props.context,
          lang: props.profile.lang,
          name: props.profile.name,
          messages: wire(),
        });
        hint.value = data.hint;
        hintsUsed.value += 1;
      } catch (err) {
        error.value = err?.message || 'Could not get a hint. Try again.';
      } finally {
        hintLoading.value = false;
      }
    }

    const hideHint = () => { hint.value = null; };
    const useHintPhrase = (phrase) => {
      draft.value = draft.value ? `${draft.value} ${phrase}` : phrase;
    };
    const toggleTts = () => {
      ttsOn.value = !ttsOn.value;
      if (!ttsOn.value) skipSpeech();
    };

    function finish() {
      if (!turns.value.length || phase.value === 'loading') return;
      abortController?.abort();
      stopSpeaking();
      recognizer?.cancel();
      emit('finish', {
        messages: wire(),
        turns: turns.value.map((t) => ({ ...t })),
        hintsUsed: hintsUsed.value,
        redos: redos.value,
      });
    }

    function exit() {
      abortController?.abort();
      stopSpeaking();
      recognizer?.cancel();
      emit('exit');
    }

    onMounted(requestReply);
    onBeforeUnmount(() => {
      abortController?.abort();
      stopSpeaking();
      recognizer?.cancel();
    });

    return {
      messages, turns, phase, interim, draft, error, needsRetry, hint, hintLoading,
      ttsOn, suggestFinish, chatEl, canRecognize, canSpeak,
      canHint, canRedo, nudge, micDisabled, micLabel, statusText,
      requestReply, toggleMic, submitDraft, redoLastAnswer, showHint, hideHint,
      useHintPhrase, toggleTts, skipSpeech, finish, exit,
    };
  },
  template: `
    <section class="session" aria-labelledby="session-title">
      <header class="session__bar">
        <button class="btn btn--ghost" type="button" @click="exit">Exit</button>
        <h1 id="session-title" class="session__title">
          <span aria-hidden="true">{{ scenario.emoji }}</span> {{ scenario.title }}
        </h1>
        <div class="session__actions">
          <button
            v-if="canSpeak"
            class="btn btn--ghost btn--icon"
            type="button"
            :aria-pressed="ttsOn ? 'true' : 'false'"
            :aria-label="ttsOn ? 'Mute the coach voice' : 'Turn the coach voice on'"
            @click="toggleTts"
          >{{ ttsOn ? '🔊' : '🔇' }}</button>
          <button
            class="btn"
            :class="suggestFinish ? 'btn--primary' : 'btn--soft'"
            type="button"
            :disabled="!turns.length || phase === 'loading'"
            @click="finish"
          >Finish and get feedback</button>
        </div>
      </header>

      <div class="chat" ref="chatEl" role="log" aria-live="polite" aria-label="Conversation">
        <div
          v-for="m in messages"
          :key="m.id"
          class="bubble"
          :class="m.role === 'assistant' ? 'bubble--coach' : 'bubble--you'"
        >
          <span class="bubble__who">{{ m.role === 'assistant' ? 'Coach' : 'You' }}</span>
          <p>{{ m.content }}</p>
        </div>
        <div v-if="phase === 'listening' && interim" class="bubble bubble--you bubble--live">
          <span class="bubble__who">You, live</span>
          <p>{{ interim }}</p>
        </div>
        <div v-if="phase === 'loading'" class="bubble bubble--coach bubble--typing" aria-label="The coach is typing">
          <span></span><span></span><span></span>
        </div>
      </div>

      <footer class="controls">
        <p v-if="error" class="notice notice--error" role="alert">
          {{ error }}
          <button v-if="needsRetry" class="link" type="button" @click="requestReply">Try again</button>
        </p>

        <div v-if="hint" class="hint" role="note">
          <div class="hint__head">
            <strong>A nudge, not an answer</strong>
            <button class="link" type="button" @click="hideHint">Hide</button>
          </div>
          <ul v-if="hint.ideas.length" class="hint__ideas">
            <li v-for="(idea, i) in hint.ideas" :key="'idea' + i">{{ idea }}</li>
          </ul>
          <div class="chips">
            <button v-for="(p, i) in hint.phrases" :key="'phrase' + i" class="chip" type="button" @click="useHintPhrase(p)">{{ p }}</button>
          </div>
          <p class="field__hint">Tap a phrase to add it to the text box.</p>
        </div>

        <div class="controls__main">
          <button
            v-if="canRecognize"
            class="mic"
            :class="{ 'mic--live': phase === 'listening' }"
            type="button"
            :disabled="micDisabled"
            :aria-label="micLabel"
            @click="toggleMic"
          >
            <svg v-if="phase !== 'listening'" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="3"></rect>
            </svg>
          </button>
          <p class="status" aria-live="polite">{{ statusText }}</p>
        </div>

        <div class="tools">
          <button class="btn btn--soft btn--small" type="button" :disabled="!canHint" @click="showHint">
            {{ hintLoading ? 'Finding ideas…' : 'I am stuck' }}
          </button>
          <button class="btn btn--soft btn--small" type="button" :disabled="!canRedo" @click="redoLastAnswer">Answer again</button>
          <button v-if="phase === 'speaking'" class="btn btn--soft btn--small" type="button" @click="skipSpeech">Skip the voice</button>
        </div>

        <form class="typebox" @submit.prevent="submitDraft">
          <label class="sr-only" for="typed">Type your answer</label>
          <input id="typed" class="input" type="text" v-model="draft" maxlength="1500" autocomplete="off" placeholder="Or type your answer here">
          <button class="btn btn--primary" type="submit" :disabled="!draft.trim() || !['idle', 'speaking'].includes(phase)">Send</button>
        </form>
        <p class="nudge">{{ nudge }}</p>
      </footer>
    </section>
  `,
};
