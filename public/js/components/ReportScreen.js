import { ref, computed, onMounted } from '../lib/vue.js';
import { fetchReport } from '../lib/api.js';
import { summarizeDelivery } from '../lib/metrics.js';

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const confidenceLabel = (score) => {
  if (score >= 85) return 'Very confident';
  if (score >= 70) return 'Quite confident';
  if (score >= 50) return 'Getting steadier';
  return 'Still building';
};

export default {
  name: 'ReportScreen',
  props: {
    result: { type: Object, required: true },
    scenario: { type: Object, required: true },
    profile: { type: Object, required: true },
    context: { type: String, default: '' },
  },
  emits: ['again', 'another'],
  setup(props, { emit }) {
    const status = ref('loading'); // loading | ready | error
    const report = ref(null);
    const error = ref('');
    const ringReady = ref(false);
    const copied = ref(false);

    const delivery = computed(() =>
      summarizeDelivery(props.result.turns, {
        hintsUsed: props.result.hintsUsed,
        redos: props.result.redos,
      }));

    const ringOffset = computed(() => {
      const score = report.value?.confidence_score ?? 0;
      return ringReady.value ? RING_LENGTH * (1 - score / 100) : RING_LENGTH;
    });
    const scoreLabel = computed(() => confidenceLabel(report.value?.confidence_score ?? 0));

    const paceNote = computed(() => {
      const wpm = delivery.value.wpm;
      if (wpm === null) return 'Answer by voice for a bit longer to measure your pace.';
      if (wpm < 90) return 'Unhurried. Try linking your ideas a little more smoothly.';
      if (wpm <= 160) return 'A comfortable pace for most listeners.';
      return 'Fast. Short pauses help listeners follow you.';
    });

    const greeting = computed(() =>
      props.profile.name ? `Well done, ${props.profile.name}.` : 'Well done.');

    async function load() {
      status.value = 'loading';
      error.value = '';
      ringReady.value = false;
      try {
        const data = await fetchReport({
          scenario: props.scenario.id,
          context: props.context,
          lang: props.profile.lang,
          name: props.profile.name,
          messages: props.result.messages,
          metrics: delivery.value,
        });
        report.value = data.report;
        status.value = 'ready';
        setTimeout(() => { ringReady.value = true; }, 80);
      } catch (err) {
        error.value = err?.message || 'The review could not be created. Try again.';
        status.value = 'error';
      }
    }

    async function copyTranscript() {
      const text = props.result.messages
        .map((m) => `${m.role === 'assistant' ? 'Coach' : 'You'}: ${m.content}`)
        .join('\n\n');
      try {
        await navigator.clipboard.writeText(text);
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 2500);
      } catch {
        error.value = 'Copying is blocked in this browser. Select the transcript text and copy it by hand.';
      }
    }

    const printPage = () => window.print();

    onMounted(load);

    return {
      status, report, error, delivery, ringOffset, scoreLabel, paceNote, greeting, copied,
      RING_LENGTH, load, copyTranscript, printPage,
      again: () => emit('again'),
      another: () => emit('another'),
    };
  },
  template: `
    <article class="report" aria-labelledby="report-title">
      <header class="report__head">
        <h1 id="report-title">{{ greeting }}</h1>
        <p class="lead">{{ scenario.emoji }} {{ scenario.title }}. Here is what the conversation showed.</p>
      </header>

      <section class="block" aria-labelledby="delivery-title">
        <h2 id="delivery-title" class="block__title">How you spoke</h2>
        <dl class="facts">
          <div class="fact"><dt>Answers</dt><dd>{{ delivery.answers }}</dd></div>
          <div class="fact"><dt>Average length</dt><dd>{{ delivery.avgWordsPerAnswer }} words</dd></div>
          <div class="fact">
            <dt>Pace</dt>
            <dd>{{ delivery.wpm === null ? 'n/a' : delivery.wpm + ' words/min' }}</dd>
          </div>
          <div class="fact"><dt>Filler phrases</dt><dd>{{ delivery.fillerCount }}<span v-if="delivery.topFillers.length" class="fact__sub">{{ delivery.topFillers.join(', ') }}</span></dd></div>
          <div class="fact"><dt>Long pauses</dt><dd>{{ delivery.longPauses }}</dd></div>
          <div class="fact">
            <dt>Time to start speaking</dt>
            <dd>{{ delivery.avgLatencySec === null ? 'n/a' : delivery.avgLatencySec + ' s' }}</dd>
          </div>
        </dl>
        <p class="field__hint">{{ paceNote }} Browsers usually leave out “um” and “uh”, so the filler count is a minimum.</p>
      </section>

      <section v-if="status === 'loading'" class="loading" role="status" aria-live="polite">
        <div class="orb orb--loading" aria-hidden="true"></div>
        <p>Reading your answers carefully. This takes a few seconds.</p>
      </section>

      <section v-else-if="status === 'error'" class="block">
        <p class="notice notice--error" role="alert">{{ error }}</p>
        <div class="actions actions--left">
          <button class="btn btn--primary" type="button" @click="load">Try the review again</button>
        </div>
      </section>

      <template v-else-if="report">
        <section class="score" aria-labelledby="score-title">
          <div v-if="report.confidence_score !== null" class="ring" role="img" :aria-label="'Confidence index ' + report.confidence_score + ' out of 100'">
            <svg viewBox="0 0 120 120" class="ring__svg" aria-hidden="true">
              <circle class="ring__track" cx="60" cy="60" r="52"></circle>
              <circle class="ring__value" cx="60" cy="60" r="52" :stroke-dasharray="RING_LENGTH" :stroke-dashoffset="ringOffset" transform="rotate(-90 60 60)"></circle>
            </svg>
            <div class="ring__num"><strong>{{ report.confidence_score }}</strong><span>of 100</span></div>
          </div>
          <div class="score__text">
            <h2 id="score-title" class="block__title">
              Confidence index<span v-if="report.confidence_score !== null">: {{ scoreLabel }}</span>
              <span v-if="report.level" class="badge">English level about {{ report.level }}</span>
            </h2>
            <p v-if="report.summary">{{ report.summary }}</p>
            <p v-if="report.confidence_notes" class="muted">{{ report.confidence_notes }}</p>
            <p class="field__hint">An estimate from your words and delivery in this one conversation. It is not an exam result.</p>
          </div>
        </section>

        <section v-if="report.strengths.length" class="block" aria-labelledby="strengths-title">
          <h2 id="strengths-title" class="block__title">What worked</h2>
          <ul class="tips tips--good">
            <li v-for="(s, i) in report.strengths" :key="'s' + i">{{ s }}</li>
          </ul>
        </section>

        <section class="block" aria-labelledby="mistakes-title">
          <h2 id="mistakes-title" class="block__title">Corrections</h2>
          <p v-if="!report.mistakes.length" class="muted">No clear mistakes worth fixing in this conversation. Nicely done.</p>
          <ul v-else class="fixes">
            <li v-for="(m, i) in report.mistakes" :key="'m' + i" class="fix">
              <p class="fix__line"><span class="fix__old">{{ m.original }}</span></p>
              <p class="fix__line"><span class="fix__new">{{ m.corrected }}</span></p>
              <p v-if="m.explanation" class="fix__why">{{ m.explanation }}<span v-if="m.type" class="fix__type"> ({{ m.type }})</span></p>
            </li>
          </ul>
        </section>

        <section v-if="report.better_phrases.length" class="block" aria-labelledby="phrases-title">
          <h2 id="phrases-title" class="block__title">Say it more naturally</h2>
          <ul class="swaps">
            <li v-for="(p, i) in report.better_phrases" :key="'p' + i" class="swap">
              <span class="swap__from">{{ p.instead_of }}</span>
              <span class="swap__to">{{ p.say }}</span>
              <span v-if="p.why" class="swap__why">{{ p.why }}</span>
            </li>
          </ul>
        </section>

        <section v-if="report.sample_answer" class="block" aria-labelledby="sample-title">
          <h2 id="sample-title" class="block__title">A stronger version of one answer</h2>
          <p v-if="report.sample_answer.question" class="muted">Question: {{ report.sample_answer.question }}</p>
          <blockquote class="sample">{{ report.sample_answer.answer }}</blockquote>
          <p class="field__hint">Use it as inspiration, not a script. Your own words always sound best.</p>
        </section>

        <section v-if="report.scenario_phrases.length" class="block" aria-labelledby="useful-title">
          <h2 id="useful-title" class="block__title">Phrases to keep for this situation</h2>
          <div class="chips">
            <span v-for="(p, i) in report.scenario_phrases" :key="'u' + i" class="chip chip--static">{{ p }}</span>
          </div>
        </section>

        <section v-if="report.tips.length" class="block" aria-labelledby="tips-title">
          <h2 id="tips-title" class="block__title">Next time, try this</h2>
          <ul class="tips">
            <li v-for="(t, i) in report.tips" :key="'t' + i">{{ t }}</li>
          </ul>
        </section>

        <section v-if="report.practice_topics.length" class="block" aria-labelledby="topics-title">
          <h2 id="topics-title" class="block__title">Worth practising</h2>
          <div class="chips">
            <span v-for="(t, i) in report.practice_topics" :key="'tp' + i" class="chip chip--static">{{ t }}</span>
          </div>
        </section>
      </template>

      <details class="block transcript">
        <summary>Show the full transcript</summary>
        <div class="transcript__body">
          <p v-for="(m, i) in result.messages" :key="'tr' + i" class="transcript__line">
            <strong>{{ m.role === 'assistant' ? 'Coach' : 'You' }}:</strong> {{ m.content }}
          </p>
        </div>
      </details>

      <div class="actions actions--left no-print">
        <button class="btn btn--primary" type="button" @click="again">Practise this again</button>
        <button class="btn btn--soft" type="button" @click="another">Try another situation</button>
        <button class="btn btn--ghost" type="button" @click="printPage">Print or save as PDF</button>
        <button class="btn btn--ghost" type="button" @click="copyTranscript">{{ copied ? 'Copied' : 'Copy transcript' }}</button>
      </div>
    </article>
  `,
};
