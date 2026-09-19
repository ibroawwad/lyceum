// Lyceum API — faculty proxy, purchase verification, certificate registry, library catalogue.
// Plain Node (≥ 23.4 for node:sqlite), no framework, no dependencies. Standalone: nothing shared with any other service.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const iap = require('./iap');
const cohorts = require('./cohorts');
const lib = require('./library');

const PORT = Number(process.env.PORT || 4700);
const SECRET = process.env.TOKEN_SECRET || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const FREE_FACULTY = process.env.FREE_FACULTY === '1';           // pilot: faculty without a purchase
const DEV_SECRET = process.env.IAP_DEV_SECRET || '';               // mint test entitlements without a store
const MODELS = ['anthropic/claude-fable-5.1', 'anthropic/claude-opus-5', 'anthropic/claude-sonnet-5', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'google/gemma-4-31b-it:free'];
const VERIFY_BASE = process.env.VERIFY_BASE || '';
if (!SECRET) console.warn('TOKEN_SECRET is not set: entitlement tokens cannot be issued or checked');

// ---------- tokens (HS256 JWT, device-bound, per course) ----------
const b64u = (b) => Buffer.from(b).toString('base64url');
function sign(payload) { const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64u(JSON.stringify(payload)); const s = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url'); return `${h}.${p}.${s}`; }
function verify(token) {
  if (!SECRET || !token) return null;
  const [h, p, s] = String(token).split('.'); if (!h || !p || !s) return null;
  const want = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  if (want.length !== s.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(s))) return null;
  try { const j = JSON.parse(Buffer.from(p, 'base64url')); if (j.exp && j.exp < Date.now() / 1000) return null; return j; } catch (e) { return null; }
}

// ---------- helpers ----------
const json = (res, status, body, extra = {}) => { res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra)); res.end(JSON.stringify(body)); };
const html = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function readRaw(req, limit) {
  return new Promise((resolve, reject) => { let n = 0; const chunks = []; req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); }); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); });
}
function readBody(req, limit = 3 * 1024 * 1024) {
  return new Promise((resolve, reject) => { let n = 0; const chunks = []; req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); }); req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch (e) { reject(new Error('invalid JSON')); } }); req.on('error', reject); });
}
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const row = db.prepare('SELECT n, window_start FROM ratelimit WHERE key = ?').get(key);
  if (!row || now - row.window_start > windowMs) { db.prepare('INSERT OR REPLACE INTO ratelimit (key, n, window_start) VALUES (?, 1, ?)').run(key, now); return true; }
  if (row.n >= max) return false;
  db.prepare('UPDATE ratelimit SET n = n + 1 WHERE key = ?').run(key); return true;
}
const ip = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- faculty proxy ----------
async function faculty(req, res, body) {
  if (!OPENROUTER_KEY) return json(res, 503, { error: 'The faculty is not configured on this server.' });
  const ent = verify(body.token);
  if (!ent && !FREE_FACULTY) return json(res, 402, { error: 'This course has no faculty entitlement. Enrol with a purchase to unlock papers and grading.' });
  const who = ent ? ent.jti : 'ip:' + ip(req);
  if (!rateLimit('fac:' + who, Number(process.env.FACULTY_PER_HOUR || 40), 3600e3)) return json(res, 429, { error: 'Too many faculty requests this hour. Try again later.' });
  const messages = Array.isArray(body.messages) ? body.messages.slice(0, 4) : null;
  if (!messages || !messages.length) return json(res, 400, { error: 'messages required' });
  const size = JSON.stringify(messages).length; if (size > 400000) return json(res, 413, { error: 'Prompt too large.' });
  const requested = typeof body.model === 'string' && MODELS.includes(body.model) ? body.model : null;
  const chain = requested ? [requested, ...MODELS.filter((m) => m !== requested)] : MODELS;
  const maxTokens = Math.min(Number(body.max_tokens) || 6000, 12000);
  const temperature = Math.min(Math.max(Number(body.temperature) || 0.3, 0), 1);
  // papers are deterministic enough to cache: same prompt + model → same paper for everyone
  const cacheKey = body.cache === false ? null : sha(JSON.stringify({ messages, maxTokens, temperature }));
  if (cacheKey) { const hit = db.prepare('SELECT body, model FROM cache WHERE key = ?').get(cacheKey); if (hit) return json(res, 200, { content: hit.body, model: hit.model, cached: true }); }
  const tried = [];
  for (const model of chain) {
    const t0 = Date.now();
    try {
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 90000);
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', signal: ctrl.signal, headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://lyceum.app', 'X-Title': 'Lyceum' }, body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }) });
      clearTimeout(timer);
      if (r.status === 401) return json(res, 503, { error: 'The server key was rejected by the model provider.' });
      if (!r.ok) { tried.push({ model, status: r.status }); continue; }
      const j = await r.json();
      const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!content) { tried.push({ model, status: 'empty' }); continue; }
      const u = j.usage || {};
      db.prepare('INSERT INTO usage (token_id, model, prompt_tokens, completion_tokens, cost, ms, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(who, model, u.prompt_tokens || 0, u.completion_tokens || 0, Number(u.cost || 0), Date.now() - t0, new Date().toISOString());
      if (cacheKey) db.prepare('INSERT OR REPLACE INTO cache (key, body, model, at) VALUES (?, ?, ?, ?)').run(cacheKey, content, model, new Date().toISOString());
      return json(res, 200, { content, model, ms: Date.now() - t0 });
    } catch (e) { tried.push({ model, status: e.name === 'AbortError' ? 'timeout' : 'network' }); }
  }
  return json(res, 502, { error: 'No model answered.', tried });
}

// ---------- purchases → entitlement ----------
async function iapVerify(req, res, body) {
  if (!SECRET) return json(res, 503, { error: 'Entitlements are not configured on this server.' });
  const { platform, productId, courseHash, device } = body;
  if (!courseHash || !device) return json(res, 400, { error: 'courseHash and device required' });
  let v;
  if (platform === 'ios') v = await iap.apple({ receipt: body.receipt, jws: body.jws, productId });
  else if (platform === 'android') v = await iap.google({ purchaseToken: body.purchaseToken, productId });
  else if (platform === 'dev' && DEV_SECRET && body.secret === DEV_SECRET) v = { ok: true, tx: 'dev:' + sha(courseHash + device).slice(0, 24) };
  else return json(res, 400, { error: 'unknown platform' });
  if (!v.ok) return json(res, v.status || 402, { error: v.error });
  const existing = db.prepare('SELECT token_id, course_hash, device FROM entitlements WHERE tx = ?').get(v.tx);
  if (existing && (existing.course_hash !== courseHash || existing.device !== device)) return json(res, 409, { error: 'This purchase was already used for another course or device.' });
  const jti = existing ? existing.token_id : crypto.randomUUID();
  if (!existing) db.prepare('INSERT INTO entitlements (token_id, platform, product, course_hash, device, tx, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(jti, platform, productId || '', courseHash, device, v.tx, new Date().toISOString());
  const token = sign({ jti, ch: courseHash, dev: device, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 400 * 86400 });
  return json(res, 200, { token, sandbox: !!v.sandbox });
}

// ---------- certificates ----------
function registerCertificate(req, res, body) {
  const need = ['code', 'no', 'hash', 'name', 'courseCode', 'title', 'letter', 'issuedAt'];
  for (const k of need) if (!body[k]) return json(res, 400, { error: `${k} required` });
  if (!/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(body.code) || !/^[0-9a-f]{64}$/.test(body.hash)) return json(res, 400, { error: 'bad code or hash' });
  if (!rateLimit('cert:' + ip(req), 20, 3600e3)) return json(res, 429, { error: 'Too many registrations.' });
  const row = db.prepare('SELECT hash FROM certificates WHERE code = ?').get(body.code);
  if (row && row.hash !== body.hash) return json(res, 409, { error: 'A different certificate already uses this code.' });
  if (!row) db.prepare('INSERT INTO certificates (code, no, hash, name, student_id, course_code, title, letter, pct, credits, issued_at, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(body.code, body.no, body.hash, String(body.name).slice(0, 120), String(body.studentId || '').slice(0, 40), String(body.courseCode).slice(0, 20), String(body.title).slice(0, 200), String(body.letter).slice(0, 3), Number(body.pct) || 0, Number(body.credits) || 0, body.issuedAt, new Date().toISOString());
  return json(res, 200, { ok: true, url: VERIFY_BASE ? `${VERIFY_BASE}/${body.code}` : null });
}
function verifyPage(res, code, wantJson) {
  const row = db.prepare('SELECT * FROM certificates WHERE code = ?').get(code);
  if (wantJson) return row ? json(res, 200, { found: true, certificate: row }, { 'Cache-Control': 'public, max-age=300' }) : json(res, 404, { found: false });
  const page = (inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lyceum · Certificate ${esc(code)}</title><style>body{font:16px/1.55 -apple-system,Inter,system-ui,sans-serif;background:#f3efe6;color:#22080a;margin:0;padding:40px 20px}main{max-width:560px;margin:0 auto;background:#fbf9f4;border:1px solid #e4dccf;border-radius:22px;padding:28px}h1{font-size:22px;margin:0 0 6px;color:#5a1a22}.ok{color:#2f7a4a;font-weight:600}.bad{color:#b0382f;font-weight:600}dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:18px 0}dt{color:#7d6a68}dd{margin:0}.mono{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#7d6a68;word-break:break-all}.note{font-size:13px;color:#7d6a68;margin-top:18px}@media(prefers-color-scheme:dark){body{background:#1b090d;color:#f4ecdf}main{background:#2a1017;border-color:#3b1a22}h1{color:#e9dbc1}dt,.mono,.note{color:#a88f90}.ok{color:#8bbf86}.bad{color:#e2786f}}</style></head><body><main>${inner}<p class="note">Lyceum is an independent study tool, not an accredited institution. Certificates confer no academic credit.</p></main></body></html>`;
  if (!row) return html(res, 404, page(`<h1>Certificate ${esc(code)}</h1><p class="bad">Not on record.</p><p>No certificate with this verification code has been registered.</p>`));
  return html(res, 200, page(`<h1>Certificate of Completion</h1><p class="ok">On record · ${esc(row.no)}</p><dl><dt>Student</dt><dd>${esc(row.name)}</dd><dt>Course</dt><dd>${esc(row.course_code)} · ${esc(row.title)}</dd><dt>Grade</dt><dd>${esc(row.letter)} · ${Number(row.pct).toFixed(1)}%</dd><dt>Credits</dt><dd>${esc(row.credits)}</dd><dt>Issued</dt><dd>${esc(String(row.issued_at).slice(0, 10))}</dd><dt>Registered</dt><dd>${esc(String(row.registered_at).slice(0, 10))}</dd></dl><div class="mono">${esc(row.hash)}</div>`));
}

// ---------- library ----------
function library(res) { json(res, 200, lib.publicList(), { 'Cache-Control': 'public, max-age=3600' }); }
async function libraryPack(req, res, id) {
  if (!lib.byId(id)) return json(res, 404, { error: 'unknown title' });
  if (!rateLimit('pack:' + ip(req), 30, 3600e3)) return json(res, 429, { error: 'Too many downloads this hour.' });
  const body = await lib.pack(id);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }); res.end(body);
}
async function libraryPages(req, res, id, from, to) {
  const bytes = await lib.pageSlice(id, Number(from), Number(to));
  if (!bytes) return json(res, 404, { error: 'no such pages' });
  res.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'public, max-age=86400', 'Content-Length': bytes.length }); res.end(bytes);
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Instructor-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/health') return json(res, 200, { ok: true, faculty: !!OPENROUTER_KEY, entitlements: !!SECRET, apple: true, google: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON, free: FREE_FACULTY });
    if (req.method === 'GET' && url.pathname === '/v1/library') return library(res);
    const lp = url.pathname.match(/^\/v1\/library\/([a-z0-9-]+)\/pack$/); if (req.method === 'GET' && lp) return libraryPack(req, res, lp[1]);
    const lg = url.pathname.match(/^\/v1\/library\/([a-z0-9-]+)\/pages\/(\d+)-(\d+)$/); if (req.method === 'GET' && lg) return libraryPages(req, res, lg[1], lg[2], lg[3]);
    const m = url.pathname.match(/^\/(?:verify|v1\/certificates)\/([0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4})$/);
    if (req.method === 'GET' && m) return verifyPage(res, m[1], url.pathname.startsWith('/v1/'));
    // cohorts: public reads, member writes, instructor publishing (key in the X-Instructor-Key header)
    const co = url.pathname.match(/^\/v1\/cohorts\/([A-Z2-9]{6})(?:\/(material|file\/([\w-]+)|join|progress|close))?$/);
    if (co && req.method === 'GET' && !co[2]) { const c = cohorts.get(co[1]); return c ? json(res, 200, c) : json(res, 404, { error: 'No cohort has that code.' }); }
    if (co && req.method === 'GET' && co[2] === 'material') { const m = cohorts.material(co[1]); if (!m) return json(res, 404, { error: 'not found' }); res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }); return res.end(m); }
    if (co && req.method === 'GET' && co[3]) { const f = cohorts.file(co[1], co[3]); if (!f) return json(res, 404, { error: 'not found' }); res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' }); return res.end(f); }
    if (co && req.method === 'PUT' && co[3]) { const instr = cohorts.instructorByKey(req.headers['x-instructor-key']); if (!instr) return json(res, 401, { error: 'instructor key required' }); const bytes = await readRaw(req, 60 * 1024 * 1024); const r = cohorts.putFile(instr, co[1], co[3], bytes); return json(res, r.status, r.body || { error: r.error }); }
    if (url.pathname === '/v1/instructor/cohorts' && req.method === 'GET') { const instr = cohorts.instructorByKey(req.headers['x-instructor-key']); if (!instr) return json(res, 401, { error: 'instructor key required' }); return json(res, 200, { instructor: instr, cohorts: cohorts.list(instr) }); }
    if (req.method === 'POST') {
      const body = await readBody(req, url.pathname === '/v1/instructor/cohorts' ? 16 * 1024 * 1024 : undefined);
      if (co && co[2] === 'join') { if (!rateLimit('join:' + ip(req), 30, 3600e3)) return json(res, 429, { error: 'Too many attempts.' }); const r = cohorts.join(co[1], body); if (r.status !== 200) return json(res, r.status, { error: r.error }); if (SECRET) r.body.entitlement = { token: sign({ jti: 'co:' + co[1] + ':' + sha(body.device).slice(0, 16), ch: 'cohort:' + co[1], dev: body.device, iat: Math.floor(Date.now() / 1000), exp: Math.floor(new Date(r.body.cohort.term.end + 'T23:59:59Z').getTime() / 1000) + 30 * 86400 }), platform: 'cohort' }; return json(res, 200, r.body); }
      if (co && co[2] === 'progress') { const r = cohorts.progress(co[1], body); return json(res, r.status, r.body || { error: r.error }); }
      if (co && co[2] === 'close') { const instr = cohorts.instructorByKey(req.headers['x-instructor-key']); if (!instr) return json(res, 401, { error: 'instructor key required' }); const r = cohorts.close(instr, co[1], body.closed !== false); return json(res, r.status, r.body || { error: r.error }); }
      if (url.pathname === '/v1/instructor/whoami') { const instr = cohorts.instructorByKey(body.key); return instr ? json(res, 200, instr) : json(res, 401, { error: 'That key is not an instructor key.' }); }
      if (url.pathname === '/v1/instructor/cohorts') { const instr = cohorts.instructorByKey(req.headers['x-instructor-key'] || body.key); if (!instr) return json(res, 401, { error: 'instructor key required' }); const r = cohorts.create(instr, body); return json(res, r.status, r.body || { error: r.error }); }
      if (url.pathname === '/v1/faculty/chat') return faculty(req, res, body);
      if (url.pathname === '/v1/iap/verify') return iapVerify(req, res, body);
      if (url.pathname === '/v1/certificates') return registerCertificate(req, res, body);
    }
    json(res, 404, { error: 'not found' });
  } catch (e) { console.error(e); json(res, e.message === 'body too large' ? 413 : e.message === 'invalid JSON' ? 400 : 500, { error: e.message }); }
});
server.listen(PORT, '0.0.0.0', () => console.log(`lyceum api on :${PORT}`));
