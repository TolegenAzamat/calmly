// Zero-dependency local server: serves public/ and runs the Netlify function at /api/chat.
// Usage: copy .env.example to .env, put your key in it, then `node scripts/dev-server.mjs`.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicDir = join(root, 'public');

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trim().startsWith('#')) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    if (value && process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
loadEnv(join(root, '.env'));

const { default: chat } = await import(
  pathToFileURL(join(root, 'netlify/functions/chat.mjs')).href
);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

async function readBody(req, limit = 100_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function handleApi(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end('{"error":"bad_request"}');
    return;
  }
  const request = new Request('http://localhost/api/chat', {
    method: req.method,
    headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
  const response = await chat(request, { ip: req.socket.remoteAddress });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function serveStatic(pathname, res) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  const relative = decoded === '/' ? '/index.html' : decoded;
  const filePath = normalize(join(publicDir, relative));
  if (filePath !== publicDir && !filePath.startsWith(publicDir + sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname === '/api/chat' || url.pathname === '/.netlify/functions/chat') {
      await handleApi(req, res);
    } else {
      await serveStatic(url.pathname, res);
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Server error');
  }
});

const port = Number(process.env.PORT) || 8888;
server.listen(port, () => {
  const ready = Boolean(process.env.GROQ_API_KEY);
  console.log(`Calmly is running at http://localhost:${port}`);
  if (!ready) console.log('GROQ_API_KEY is not set: add it to .env, then restart.');
});
