// The "secretary": the browser talks to this function, and only this function
// holds the Groq API key. One endpoint, three modes: turn, hint, feedback.

import {
  SCENARIO_IDS,
  BEGIN_MESSAGE,
  buildTurnSystem,
  buildHintSystem,
  buildCorrectionsSystem,
  buildCoachingSystem,
  buildFeedbackUser,
  formatTranscript,
} from '../lib/prompts.mjs';

const MAX_BODY_BYTES = 80_000;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 2000;
const MAX_TOTAL_CHARS = 16_000;
const MAX_CONTEXT_CHARS = 3000;
const WRAP_UP_AFTER_ANSWERS = 8;
const RATE_WINDOW_MS = 10 * 60 * 1000;

// Groq moved Llama to enterprise-only in Aug 2026; these are the free-tier chat models.
const chatModel = () => process.env.GROQ_MODEL_CHAT || 'openai/gpt-oss-20b';
const feedbackModel = () => process.env.GROQ_MODEL_FEEDBACK || 'openai/gpt-oss-120b';

// gpt-oss models "think" first, and thinking tokens count against the output limit.
// Keep thinking short and leave headroom so the visible answer is never cut off.
const isReasoningModel = (model) => /gpt-oss|qwen3/i.test(model);
const REASONING_HEADROOM = 700;
const timeoutMs = () => Number(process.env.AI_TIMEOUT_MS) || 9000;
const baseUrl = () => (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');

class UpstreamError extends Error {
  constructor(code, status, retryAfter) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter ?? null;
  }
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });

// ---------------------------------------------------------------- rate limit
// Best effort only: serverless instances come and go. The provider's own
// limits are the real ceiling; this just stops one address hammering the site.
const hits = new Map();

function isLimited(ip) {
  const limit = Number(process.env.RATE_LIMIT_PER_10MIN) || 120;
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(key);
    }
  }
  return recent.length > limit;
}

// ---------------------------------------------------------------- validation
const clean = (v, max) =>
  typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '';

const cleanName = (v) =>
  clean(v, 40)
    .replace(/[^\p{L}\p{M}\s'’.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const cleanContext = (v) => clean(v, MAX_CONTEXT_CHARS).replace(/"""/g, "'''");

const num = (v, min, max) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;

function cleanMetrics(m) {
  if (!m || typeof m !== 'object') return null;
  return {
    answers: num(m.answers, 0, 100),
    spokenAnswers: num(m.spokenAnswers, 0, 100),
    typedAnswers: num(m.typedAnswers, 0, 100),
    avgWordsPerAnswer: num(m.avgWordsPerAnswer, 0, 2000),
    wpm: num(m.wpm, 0, 400),
    fillerCount: num(m.fillerCount, 0, 1000),
    fillersPer100: num(m.fillersPer100, 0, 100),
    topFillers: Array.isArray(m.topFillers)
      ? m.topFillers.slice(0, 5).map((f) => clean(String(f), 30)).filter(Boolean)
      : [],
    longPauses: num(m.longPauses, 0, 500),
    avgLatencySec: num(m.avgLatencySec, 0, 120),
    hintsUsed: num(m.hintsUsed, 0, 100),
    redos: num(m.redos, 0, 100),
  };
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') return { error: 'bad_request' };
  const mode = body.mode;
  if (!['turn', 'hint', 'feedback'].includes(mode)) return { error: 'bad_request' };
  if (!SCENARIO_IDS.includes(body.scenario)) return { error: 'bad_request' };
  if (!Array.isArray(body.messages) || body.messages.length > MAX_MESSAGES) {
    return { error: 'bad_request' };
  }

  const messages = [];
  let total = 0;
  for (const m of body.messages) {
    const role = m?.role;
    const content = clean(m?.content, MAX_MESSAGE_CHARS);
    if ((role !== 'user' && role !== 'assistant') || !content) return { error: 'bad_request' };
    total += content.length;
    messages.push({ role, content });
  }
  if (total > MAX_TOTAL_CHARS) return { error: 'bad_request' };

  const last = messages.at(-1);
  if (mode === 'turn' && last && last.role !== 'user') return { error: 'bad_request' };
  if (mode === 'hint' && last?.role !== 'assistant') return { error: 'bad_request' };
  if (mode === 'feedback' && !messages.some((m) => m.role === 'user')) {
    return { error: 'bad_request' };
  }

  return {
    value: {
      mode,
      scenarioId: body.scenario,
      lang: body.lang === 'ru' ? 'ru' : 'en',
      context: cleanContext(body.context),
      name: cleanName(body.name),
      messages,
      metrics: cleanMetrics(body.metrics),
    },
  };
}

// ---------------------------------------------------------------- Groq call
async function callGroq({ model, messages, temperature, maxTokens, json: wantJson = false, lean = false }) {
  const body = { model, messages, temperature, max_tokens: maxTokens };
  if (isReasoningModel(model)) {
    body.max_tokens = maxTokens + REASONING_HEADROOM;
    if (!lean && /gpt-oss/i.test(model)) body.reasoning_effort = 'low';
  }
  if (wantJson && !lean) body.response_format = { type: 'json_object' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  let res;
  try {
    res = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new UpstreamError(err?.name === 'AbortError' ? 'ai_timeout' : 'ai_unavailable', 504);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // A model may reject JSON mode or reasoning_effort: retry once with plain parameters.
    // (Replies are parsed leniently anyway.)
    if (res.status === 400 && !lean) {
      return callGroq({ model, messages, temperature, maxTokens, json: false, lean: true });
    }
    if (res.status === 401 || res.status === 403) throw new UpstreamError('ai_auth', 500);
    if (res.status === 404) throw new UpstreamError('ai_model', 500);
    if (res.status === 429) {
      throw new UpstreamError('rate_limited', 429, Number(res.headers.get('retry-after')) || null);
    }
    throw new UpstreamError('ai_unavailable', 502);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new UpstreamError('ai_unavailable', 502);
  }
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new UpstreamError('ai_unavailable', 502);
  return text.trim();
}

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no_json');
    return JSON.parse(text.slice(start, end + 1));
  }
}

async function callJson({ model, system, user, maxTokens, temperature = 0.3 }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const text = await callGroq({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: attempt === 0 ? temperature : 0.1,
      maxTokens,
      json: true,
    });
    try {
      return parseJsonLoose(text);
    } catch {
      // try once more with a colder temperature
    }
  }
  throw new UpstreamError('ai_unavailable', 502);
}

// ---------------------------------------------------------------- normalisers
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const list = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
const strings = (v, n, max) => list(v, n).map((s) => clean(s, max)).filter(Boolean);

function toScore(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n))) : null;
}

function normalizeCorrections(o) {
  const obj = o && typeof o === 'object' ? o : {};
  const sample = obj.sample_answer;
  const answer = clean(sample?.answer, 1200);
  return {
    mistakes: list(obj.mistakes, 6)
      .map((m) => ({
        type: clean(m?.type, 30),
        original: clean(m?.original, 300),
        corrected: clean(m?.corrected, 300),
        explanation: clean(m?.explanation, 300),
      }))
      .filter((m) => m.original && m.corrected && m.original.toLowerCase() !== m.corrected.toLowerCase()),
    better_phrases: list(obj.better_phrases, 5)
      .map((p) => ({
        instead_of: clean(p?.instead_of, 200),
        say: clean(p?.say, 200),
        why: clean(p?.why, 200),
      }))
      .filter((p) => p.instead_of && p.say),
    sample_answer: answer ? { question: clean(sample?.question, 300), answer } : null,
  };
}

function normalizeCoaching(o) {
  const obj = o && typeof o === 'object' ? o : {};
  const level = String(obj.level ?? '').toUpperCase().trim();
  return {
    level: LEVELS.includes(level) ? level : null,
    confidence_score: toScore(obj.confidence_score),
    confidence_notes: clean(obj.confidence_notes, 500),
    summary: clean(obj.summary, 700),
    strengths: strings(obj.strengths, 4, 250),
    scenario_phrases: strings(obj.scenario_phrases, 5, 160),
    tips: strings(obj.tips, 3, 350),
    practice_topics: strings(obj.practice_topics, 4, 200),
  };
}

function tidyReply(text) {
  // Strip markdown first, so a bold label like "**Coach:**" is plain "Coach:" before we drop it.
  return text
    .replace(/[*_`#]+/g, '')
    .replace(/^\s*(coach|interviewer|assistant)\s*:\s*/i, '')
    .replace(/^["“](.*)["”]$/s, '$1')
    .trim()
    .slice(0, 700);
}

// ---------------------------------------------------------------- handler
export default async (req, context) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
  if (!process.env.GROQ_API_KEY) return json({ error: 'server_not_configured' }, 500);

  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  if (isLimited(ip)) return json({ error: 'too_many_requests' }, 429, { 'Retry-After': '60' });

  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json({ error: 'bad_request' }, 413);
  }

  let raw;
  try {
    raw = await req.text();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'bad_request' }, 413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const checked = validatePayload(body);
  if (checked.error) return json({ error: checked.error }, 400);
  const { mode, scenarioId, lang, context: studentContext, name, messages, metrics } = checked.value;

  try {
    if (mode === 'turn') {
      const answers = messages.filter((m) => m.role === 'user').length;
      const system = buildTurnSystem({ scenarioId, context: studentContext, name, answers });
      const reply = await callGroq({
        model: chatModel(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: BEGIN_MESSAGE },
          ...messages,
        ],
        temperature: 0.7,
        maxTokens: 180,
      });
      return json({ reply: tidyReply(reply), suggestFinish: answers >= WRAP_UP_AFTER_ANSWERS });
    }

    if (mode === 'hint') {
      const raw = await callJson({
        model: chatModel(),
        system: buildHintSystem({ scenarioId, context: studentContext, lang }),
        user: `Conversation so far:\n${formatTranscript(messages.slice(-6))}\n\nThe student needs help answering the COACH's last message.`,
        maxTokens: lang === 'ru' ? 500 : 320,
        temperature: 0.5,
      });
      return json({
        hint: {
          ideas: strings(raw?.ideas, 3, 250),
          phrases: strings(raw?.phrases, 4, 120),
        },
      });
    }

    // feedback: two smaller calls in parallel finish well inside Netlify's 10 s limit
    const user = buildFeedbackUser({ messages, metrics, context: studentContext });
    const scale = lang === 'ru' ? 1.6 : 1;
    const [corrections, coaching] = await Promise.all([
      callJson({
        model: feedbackModel(),
        system: buildCorrectionsSystem({ lang }),
        user,
        maxTokens: Math.round(1100 * scale),
      }),
      callJson({
        model: feedbackModel(),
        system: buildCoachingSystem({ lang, scenarioId }),
        user,
        maxTokens: Math.round(900 * scale),
      }),
    ]);
    return json({ report: { ...normalizeCoaching(coaching), ...normalizeCorrections(corrections) } });
  } catch (err) {
    if (err instanceof UpstreamError) {
      return json({ error: err.code, retryAfter: err.retryAfter }, err.status);
    }
    console.error('chat function failed', err);
    return json({ error: 'server_error' }, 500);
  }
};

// Exposed for tests only.
export const __test = {
  validatePayload,
  parseJsonLoose,
  normalizeCorrections,
  normalizeCoaching,
  tidyReply,
  resetRateLimiter: () => hits.clear(),
};
