// Ids must match SCENARIO_IDS in netlify/lib/prompts.mjs. The prompts themselves stay on the server.
export const SCENARIOS = [
  {
    id: 'job-interview',
    emoji: '💼',
    title: 'Job interview',
    tagline: 'Introduce yourself, talk about your strengths, handle the tough questions.',
    contextLabel: 'About the job (optional)',
    contextPlaceholder: 'For example: junior frontend developer at a startup. I have two years of experience with Vue.',
    tips: [
      'Answer in two or three sentences, then stop. A short, clear answer sounds confident.',
      'Use one real example instead of listing many qualities.',
      'It is fine to say “Let me think for a moment.” Interviewers expect pauses.',
    ],
  },
  {
    id: 'nu-interview',
    emoji: '🎓',
    title: 'Master’s admission interview',
    tagline: 'Leadership in Education: motivation, leadership experience and goals.',
    contextLabel: 'Your background and motivation (optional)',
    contextPlaceholder: 'For example: I taught robotics to children for two years and want to improve how schools use technology.',
    tips: [
      'Connect each answer to education: what problem you saw, what you did, what you learned.',
      'Prepare a 30-second story about a time you led or changed something.',
      'Say what you want to do after the programme. A clear goal sounds committed.',
    ],
  },
  {
    id: 'presentation-defense',
    emoji: '📊',
    title: 'Presentation or project defence',
    tagline: 'Present your work in a minute, then answer follow-up questions.',
    contextLabel: 'Your topic or presentation text (recommended)',
    contextPlaceholder: 'Paste your abstract, slide text or a few sentences about your project. The coach will ask questions about it.',
    tips: [
      'Start with the one-sentence point of your project before any details.',
      'When you do not know something, say what you do know and what you would check next.',
      'Slow down at numbers and key terms. Listeners need time to follow.',
    ],
  },
  {
    id: 'small-talk',
    emoji: '☕',
    title: 'Small talk',
    tagline: 'Relaxed conversation with a classmate: studies, hobbies, plans.',
    contextLabel: 'Anything you want to talk about (optional)',
    contextPlaceholder: 'For example: I like football and travelling. I would like to practise talking about my weekend.',
    tips: [
      'Give a little more than yes or no, then ask a question back.',
      'Mistakes do not matter here. Keeping the conversation going does.',
      'Short reactions like “Really?” or “That sounds fun” make you sound natural.',
    ],
  },
  {
    id: 'audience-qa',
    emoji: '🎤',
    title: 'Audience questions after a talk',
    tagline: 'Answer clarifying and challenging questions about your topic.',
    contextLabel: 'The topic of your talk (recommended)',
    contextPlaceholder: 'For example: how emotion recognition can help teachers see when students are struggling.',
    tips: [
      'Repeat or rephrase the question first. It gives you a moment to think.',
      'If a question is hard, say “That is a good point” and answer what you can.',
      'Use a simple example when an idea is complicated.',
    ],
  },
];

export const getScenario = (id) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
