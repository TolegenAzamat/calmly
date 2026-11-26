import { ref, onBeforeUnmount } from '../lib/vue.js';

const PHASES = [
  { label: 'Breathe in', secs: 4, scale: 1 },
  { label: 'Hold', secs: 2, scale: 1 },
  { label: 'Breathe out', secs: 6, scale: 0.55 },
];
const ROUNDS = 3;
const IDLE_LABEL = 'Ready when you are';

export default {
  name: 'BreathingExercise',
  setup() {
    const running = ref(false);
    const finished = ref(false);
    const label = ref(IDLE_LABEL);
    const scale = ref(0.55);
    const seconds = ref(0.6);
    const round = ref(0);
    let timer = null;

    function step(index, completedRounds) {
      if (completedRounds >= ROUNDS) {
        running.value = false;
        finished.value = true;
        label.value = 'Nice and steady. Start whenever you like.';
        seconds.value = 1.2;
        scale.value = 0.7;
        return;
      }
      const phase = PHASES[index];
      label.value = phase.label;
      seconds.value = phase.secs;
      scale.value = phase.scale;
      round.value = completedRounds + 1;
      timer = setTimeout(() => {
        const next = index + 1;
        if (next === PHASES.length) step(0, completedRounds + 1);
        else step(next, completedRounds);
      }, phase.secs * 1000);
    }

    function start() {
      clearTimeout(timer);
      finished.value = false;
      running.value = true;
      step(0, 0);
    }

    function stop() {
      clearTimeout(timer);
      running.value = false;
      finished.value = false;
      label.value = IDLE_LABEL;
      scale.value = 0.55;
      seconds.value = 0.6;
      round.value = 0;
    }

    onBeforeUnmount(() => clearTimeout(timer));

    return { running, finished, label, scale, seconds, round, ROUNDS, start, stop };
  },
  template: `
    <div class="breath">
      <div class="breath__stage" aria-hidden="true">
        <div class="orb orb--breath" :style="{ transform: 'scale(' + scale + ')', transitionDuration: seconds + 's' }"></div>
      </div>
      <div class="breath__body">
        <p class="breath__label" aria-live="polite">{{ label }}</p>
        <p v-if="running" class="breath__meta">Round {{ round }} of {{ ROUNDS }}</p>
        <p v-else class="breath__meta">In for 4, hold for 2, out for 6. Three rounds.</p>
        <button v-if="!running" class="btn btn--soft" type="button" @click="start">
          {{ finished ? 'Breathe again' : 'Start breathing exercise' }}
        </button>
        <button v-else class="btn btn--ghost" type="button" @click="stop">Stop</button>
      </div>
    </div>
  `,
};
