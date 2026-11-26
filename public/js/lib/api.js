export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

const MESSAGES = {
  rate_limited: 'The free AI service is busy right now. Wait a few seconds and try again.',
  too_many_requests: 'Too many requests from this network. Wait a minute and try again.',
  ai_timeout: 'The AI took too long to answer. Try again.',
  ai_unavailable: 'The AI service did not respond. Try again in a moment.',
  ai_auth: 'The AI key was rejected by the provider. The site owner needs to check GROQ_API_KEY.',
  ai_model: 'The configured AI model is not available. The site owner needs to check the model names.',
  server_not_configured: 'The AI key is not set up on the server yet. See the README, section “Deploy”.',
  bad_request: 'That request could not be processed. Try again, or start a new session.',
  network: 'Cannot reach the server. Check your internet connection and try again.',
};

const FALLBACK = 'Something went wrong. Try again.';

async function post(payload, options = {}) {
  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: options.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('network', MESSAGES.network);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body (for example a platform error page)
  }

  if (!res.ok) {
    const code = data?.error ?? 'server_error';
    throw new ApiError(code, MESSAGES[code] ?? FALLBACK);
  }
  return data;
}

export const fetchReply = (args, options) => post({ mode: 'turn', ...toPayload(args) }, options);
export const fetchHint = (args, options) => post({ mode: 'hint', ...toPayload(args) }, options);
export const fetchReport = (args, options) => post({ mode: 'feedback', ...toPayload(args) }, options);

function toPayload({ scenario, context, lang, name, messages, metrics }) {
  return { scenario, context, lang, name, messages, metrics };
}
