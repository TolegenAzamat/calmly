import { ref, reactive, computed } from './lib/vue.js';
import { getScenario } from './lib/scenarios.js';
import { loadProfile, saveProfile, forgetProfile } from './lib/storage.js';
import WelcomeScreen from './components/WelcomeScreen.js';
import PrepScreen from './components/PrepScreen.js';
import SessionScreen from './components/SessionScreen.js';
import ReportScreen from './components/ReportScreen.js';

export default {
  name: 'App',
  components: { WelcomeScreen, PrepScreen, SessionScreen, ReportScreen },
  setup() {
    const screen = ref('welcome'); // welcome | prep | session | report
    const profile = reactive(loadProfile());
    const plan = reactive({ scenarioId: 'job-interview', context: '' });
    const result = ref(null);
    const sessionKey = ref(0);
    const scenario = computed(() => getScenario(plan.scenarioId));

    function begin({ name, lang, scenarioId, context }) {
      profile.name = name;
      profile.lang = lang;
      saveProfile(profile);
      plan.scenarioId = scenarioId;
      plan.context = context;
      screen.value = 'prep';
      window.scrollTo(0, 0);
    }

    function startSession() {
      sessionKey.value += 1;
      screen.value = 'session';
    }

    function finishSession(payload) {
      result.value = payload;
      screen.value = 'report';
      window.scrollTo(0, 0);
    }

    function backToStart() {
      result.value = null;
      screen.value = 'welcome';
      window.scrollTo(0, 0);
    }

    function practiseAgain() {
      result.value = null;
      screen.value = 'prep';
      window.scrollTo(0, 0);
    }

    function forget() {
      forgetProfile();
      profile.name = '';
      profile.lang = 'en';
    }

    return {
      screen, profile, plan, result, sessionKey, scenario,
      begin, startSession, finishSession, backToStart, practiseAgain, forget,
    };
  },
  template: `
    <div class="app" :class="{ 'app--session': screen === 'session' }">
      <header class="topbar no-print">
        <div class="brand">
          <svg class="brand__mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <circle cx="16" cy="16" r="15" fill="#2c7bd0"></circle>
            <path d="M5 17c3-5 6-5 9 0s6 5 9 0 3-3 4-3" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"></path>
          </svg>
          <span class="brand__name">Calmly</span>
        </div>
      </header>

      <main class="main">
        <WelcomeScreen v-if="screen === 'welcome'" :profile="profile" :initial-plan="plan" @begin="begin" @forget="forget" />
        <PrepScreen v-else-if="screen === 'prep'" :scenario="scenario" :profile="profile" @back="backToStart" @start="startSession" />
        <SessionScreen v-else-if="screen === 'session'" :key="sessionKey" :scenario="scenario" :profile="profile" :context="plan.context" @finish="finishSession" @exit="backToStart" />
        <ReportScreen v-else :result="result" :scenario="scenario" :profile="profile" :context="plan.context" @again="practiseAgain" @another="backToStart" />
      </main>

      <footer v-if="screen !== 'session'" class="footer no-print">
        <p>
          Calmly saves only your first name on this device. Your spoken words are turned into text by your browser’s speech service
          (in Chrome and Edge this is done by Google or Microsoft). The text of your answers is sent to an AI service to write the coach’s replies and your review.
          Do not share private or sensitive details.
        </p>
      </footer>
    </div>
  `,
};
