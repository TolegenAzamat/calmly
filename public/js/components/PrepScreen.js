import BreathingExercise from './BreathingExercise.js';
import { unlockSpeech } from '../lib/speech.js';

export default {
  name: 'PrepScreen',
  components: { BreathingExercise },
  props: {
    scenario: { type: Object, required: true },
    profile: { type: Object, required: true },
  },
  emits: ['back', 'start'],
  setup(props, { emit }) {
    function start() {
      unlockSpeech(); // must happen inside the tap so mobile browsers allow the coach's voice
      emit('start');
    }
    return { start };
  },
  template: `
    <section class="prep" aria-labelledby="prep-title">
      <button class="link prep__back" type="button" @click="$emit('back')">Change situation</button>
      <h1 id="prep-title" class="prep__title">
        <span aria-hidden="true">{{ scenario.emoji }}</span> {{ scenario.title }}
      </h1>

      <div class="prep__grid">
        <section class="prep__col" aria-labelledby="how-title">
          <h2 id="how-title" class="block__title">How it works</h2>
          <ol class="steps">
            <li>The coach opens the conversation and asks a question.</li>
            <li>Tap the microphone, answer in your own words, tap again when you are done. You can also type.</li>
            <li>Nothing is corrected during the conversation. Finish when you like and read your review.</li>
          </ol>
          <h2 class="block__title">Three things to keep in mind</h2>
          <ul class="tips">
            <li v-for="(tip, i) in scenario.tips" :key="i">{{ tip }}</li>
          </ul>
        </section>

        <section class="prep__col" aria-labelledby="calm-title">
          <h2 id="calm-title" class="block__title">Calm start</h2>
          <p class="field__hint">Optional. Slow breathing lowers your heart rate before you speak.</p>
          <BreathingExercise />
        </section>
      </div>

      <div class="actions">
        <button class="btn btn--primary btn--large" type="button" @click="start">Start conversation</button>
      </div>
    </section>
  `,
};
