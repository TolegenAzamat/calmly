import test from 'node:test';
import assert from 'node:assert/strict';
import { countWords, countFillers, summarizeDelivery } from '../public/js/lib/metrics.js';

test('countWords handles punctuation and contractions', () => {
  assert.equal(countWords('Hello, world! It’s fine.'), 4);
  assert.equal(countWords("I don't know"), 3);
  assert.equal(countWords('   '), 0);
  assert.equal(countWords(undefined), 0);
});

test('countFillers finds phrases case-insensitively and ignores partial words', () => {
  const { total, byPhrase } = countFillers('You know, I mean, basically it was, you know, fine. Umbrella and error.');
  assert.equal(total, 4);
  assert.equal(byPhrase['you know'], 2);
  assert.equal(byPhrase['i mean'], 1);
  assert.equal(byPhrase.basically, 1);
});

test('summarizeDelivery computes pace only from timed voice answers', () => {
  const turns = [
    { text: 'one two three four five six seven eight nine ten', via: 'voice', words: 10, speakingSec: 6, latencySec: 1, longPauses: 1 },
    { text: 'a b c d e f g h i j k l', via: 'voice', words: 12, speakingSec: 6, latencySec: 3, longPauses: 0 },
    { text: 'typed answer you know', via: 'text', words: 4 },
  ];
  const s = summarizeDelivery(turns, { hintsUsed: 2, redos: 1 });
  assert.equal(s.answers, 3);
  assert.equal(s.spokenAnswers, 2);
  assert.equal(s.typedAnswers, 1);
  assert.equal(s.wpm, 110); // 22 words in 12 seconds
  assert.equal(s.avgLatencySec, 2);
  assert.equal(s.longPauses, 1);
  assert.equal(s.fillerCount, 1);
  assert.deepEqual(s.topFillers, ['you know ×1']);
  assert.equal(s.hintsUsed, 2);
  assert.equal(s.redos, 1);
});

test('summarizeDelivery returns null pace when there is too little speech', () => {
  const s = summarizeDelivery([{ text: 'hi there', via: 'voice', words: 2, speakingSec: 2.5, latencySec: 0.5, longPauses: 0 }]);
  assert.equal(s.wpm, null);
  assert.equal(s.avgWordsPerAnswer, 2);
});

test('summarizeDelivery copes with no answers', () => {
  const s = summarizeDelivery([]);
  assert.equal(s.answers, 0);
  assert.equal(s.avgWordsPerAnswer, 0);
  assert.equal(s.fillersPer100, 0);
  assert.equal(s.avgLatencySec, null);
});
