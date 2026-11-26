import { ref, computed } from '../lib/vue.js';
import { SCENARIOS } from '../lib/scenarios.js';
import { canRecognize } from '../lib/speech.js';

const MAX_CONTEXT = 2500;

export default {
  name: 'WelcomeScreen',
  props: {
    profile: { type: Object, required: true },
    initialPlan: { type: Object, required: true },
  },
  emits: ['begin', 'forget'],
  setup(props, { emit }) {
    const name = ref(props.profile.name || '');
    const lang = ref(props.profile.lang || 'en');
    const scenarioId = ref(props.initialPlan.scenarioId);
    const context = ref(props.initialPlan.context || '');
    const scenario = computed(() => SCENARIOS.find((s) => s.id === scenarioId.value) ?? SCENARIOS[0]);
    const remembered = computed(() => Boolean(props.profile.name));

    const pick = (id) => {
      scenarioId.value = id;
    };
    const setLang = (value) => {
      lang.value = value;
    };

    function submit() {
      emit('begin', {
        name: name.value.trim().slice(0, 40),
        lang: lang.value,
        scenarioId: scenarioId.value,
        context: context.value.trim().slice(0, MAX_CONTEXT),
      });
    }

    function forgetMe() {
      name.value = '';
      emit('forget');
    }

    return {
      name, lang, scenarioId, context, scenario, remembered, SCENARIOS,
      MAX_CONTEXT, canRecognize, pick, setLang, submit, forgetMe,
    };
  },
  template: `
    <form class="welcome" @submit.prevent="submit">
      <section class="hero">
        <div class="hero__text">
          <h1>Say it out loud before it counts.</h1>
          <p class="lead">
            Practise interviews, presentations and everyday conversations with a patient AI partner.
            It never interrupts to correct you. After you finish, you get a clear review, better phrases and next steps.
          </p>
          <p v-if="remembered" class="hello">
            Good to see you again, {{ profile.name }}.
            <button class="link" type="button" @click="forgetMe">Not you? Forget this name</button>
          </p>
        </div>
        <div class="hero__orb" aria-hidden="true">
          <div class="orb orb--hero"></div>
        </div>
      </section>

      <p v-if="!canRecognize" class="notice notice--info" role="note">
        This browser cannot listen to your voice. You can still practise by typing, or open Calmly in Chrome or Edge to speak.
      </p>

      <section class="block" aria-labelledby="name-label">
        <label id="name-label" class="field__label" for="name">What should the coach call you?</label>
        <input id="name" class="input input--short" type="text" v-model="name" maxlength="40" autocomplete="given-name" placeholder="First name (optional)">
      </section>

      <section class="block" aria-labelledby="scenario-label">
        <h2 id="scenario-label" class="block__title">Choose a situation</h2>
        <div class="scenarios" role="radiogroup" aria-labelledby="scenario-label">
          <button
            v-for="s in SCENARIOS"
            :key="s.id"
            type="button"
            class="scenario"
            :class="{ 'scenario--on': s.id === scenarioId }"
            role="radio"
            :aria-checked="s.id === scenarioId ? 'true' : 'false'"
            @click="pick(s.id)"
          >
            <span class="scenario__emoji" aria-hidden="true">{{ s.emoji }}</span>
            <span class="scenario__text">
              <span class="scenario__title">{{ s.title }}</span>
              <span class="scenario__tag">{{ s.tagline }}</span>
            </span>
          </button>
        </div>
      </section>

      <section class="block" aria-labelledby="context-label">
        <label id="context-label" class="field__label" for="context">{{ scenario.contextLabel }}</label>
        <textarea id="context" class="input input--area" v-model="context" :maxlength="MAX_CONTEXT" rows="4" :placeholder="scenario.contextPlaceholder"></textarea>
        <p class="field__hint">{{ context.length }} / {{ MAX_CONTEXT }}. The more the coach knows, the more specific the questions.</p>
      </section>

      <section class="block block--row" aria-labelledby="lang-label">
        <div>
          <h2 id="lang-label" class="block__title">Explain my mistakes in</h2>
          <p class="field__hint">The conversation is always in English. This only changes the review.</p>
        </div>
        <div class="segmented" role="radiogroup" aria-labelledby="lang-label">
          <button type="button" role="radio" :aria-checked="lang === 'en' ? 'true' : 'false'" :class="{ 'segmented__on': lang === 'en' }" @click="setLang('en')">English</button>
          <button type="button" role="radio" :aria-checked="lang === 'ru' ? 'true' : 'false'" :class="{ 'segmented__on': lang === 'ru' }" @click="setLang('ru')">Русский</button>
        </div>
      </section>

      <div class="actions">
        <button class="btn btn--primary btn--large" type="submit">Continue</button>
      </div>
    </form>
  `,
};
