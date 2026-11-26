// Delivery metrics measured on the device. Pure functions, covered by tests/metrics.test.mjs.

const FILLERS = [
  'you know',
  'i mean',
  'sort of',
  'kind of',
  'basically',
  'actually',
  'literally',
  'um',
  'uh',
  'er',
  'erm',
  'hmm',
];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FILLER_PATTERN = new RegExp(`\\b(${FILLERS.map(escapeRegExp).join('|')})\\b`, 'gi');

export const LONG_PAUSE_MS = 2500;

export function countWords(text) {
  return (String(text ?? '').match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? []).length;
}

export function countFillers(text) {
  const byPhrase = {};
  let total = 0;
  for (const match of String(text ?? '').matchAll(FILLER_PATTERN)) {
    const phrase = match[1].toLowerCase();
    byPhrase[phrase] = (byPhrase[phrase] ?? 0) + 1;
    total += 1;
  }
  return { total, byPhrase };
}

const round1 = (n) => Math.round(n * 10) / 10;

export function summarizeDelivery(turns, extras = {}) {
  const answers = turns.length;
  const voice = turns.filter((t) => t.via === 'voice');
  const typed = answers - voice.length;

  const wordsOf = (t) => (typeof t.words === 'number' ? t.words : countWords(t.text));
  const totalWords = turns.reduce((sum, t) => sum + wordsOf(t), 0);

  const timed = voice.filter((t) => t.speakingSec >= 2);
  const timedWords = timed.reduce((sum, t) => sum + wordsOf(t), 0);
  const timedSeconds = timed.reduce((sum, t) => sum + t.speakingSec, 0);
  const wpm = timedSeconds >= 6 ? Math.round((timedWords / timedSeconds) * 60) : null;

  const fillerTotals = {};
  let fillerCount = 0;
  for (const t of turns) {
    const { total, byPhrase } = countFillers(t.text);
    fillerCount += total;
    for (const [phrase, n] of Object.entries(byPhrase)) {
      fillerTotals[phrase] = (fillerTotals[phrase] ?? 0) + n;
    }
  }
  const topFillers = Object.entries(fillerTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([phrase, n]) => `${phrase} ×${n}`);

  const latencies = voice.map((t) => t.latencySec).filter((v) => typeof v === 'number');
  const avgLatencySec = latencies.length
    ? round1(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  return {
    answers,
    spokenAnswers: voice.length,
    typedAnswers: typed,
    avgWordsPerAnswer: answers ? Math.round(totalWords / answers) : 0,
    wpm,
    fillerCount,
    fillersPer100: totalWords ? round1((fillerCount / totalWords) * 100) : 0,
    topFillers,
    longPauses: voice.reduce((sum, t) => sum + (t.longPauses ?? 0), 0),
    avgLatencySec,
    hintsUsed: extras.hintsUsed ?? 0,
    redos: extras.redos ?? 0,
  };
}
