// Cohorts: an instructor publishes a course (the registrar's full plan plus the material) under a short code;
// students join with the code and enrol on the same term, the same days, the same papers. Progress is reported
// back so the class sees itself. Instructors are accounts created on the box (node admin.js add "Name").
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const DATA = path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, 'data', 'x')), 'cohorts');
fs.mkdirSync(DATA, { recursive: true });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const now = () => new Date().toISOString();

// ---------- instructors ----------
function addInstructor(name) {
  const key = 'lyi_' + crypto.randomBytes(18).toString('base64url');
  const id = 'i_' + crypto.randomBytes(6).toString('hex');
  db.prepare('INSERT INTO instructors (id, name, key_hash, created_at) VALUES (?, ?, ?, ?)').run(id, name, sha(key), now());
  return { id, name, key };
}
const instructorByKey = (key) => (key ? db.prepare('SELECT id, name FROM instructors WHERE key_hash = ?').get(sha(String(key))) : null) || null;

// ---------- cohorts ----------
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
function newCode() { for (;;) { const c = Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % 32]).join(''); if (!db.prepare('SELECT 1 FROM cohorts WHERE code = ?').get(c)) return c; } }
const publicCohort = (row, members) => ({ code: row.code, title: row.title, courseCode: row.course_code, term: { start: row.term_start, end: row.term_end, weeks: row.weeks }, pace: row.pace, instructor: (db.prepare('SELECT name FROM instructors WHERE id = ?').get(row.instructor_id) || {}).name || 'Instructor', members, closed: !!row.closed, createdAt: row.created_at });
const memberCount = (code) => db.prepare('SELECT COUNT(*) AS n FROM members WHERE cohort = ?').get(code).n;

// publish: the plan (a Prospectus without its material) and the material pack (text + source metadata)
function create(instr, body) {
  const c = body.course, m = body.material;
  if (!c || !c.title || !c.term || !c.plan || !Array.isArray(c.sessions) || !Array.isArray(c.assessments)) return { status: 400, error: 'course plan required' };
  if (!m || typeof m.text !== 'string' || m.text.length > 12 * 1024 * 1024) return { status: 400, error: 'material text required (≤ 12 MB)' };
  if (db.prepare('SELECT COUNT(*) AS n FROM cohorts WHERE instructor_id = ?').get(instr.id).n >= 200) return { status: 429, error: 'cohort limit reached' };
  const code = newCode();
  const course = Object.assign({}, c); delete course.sourcesText; delete course.sourceFiles;
  db.prepare('INSERT INTO cohorts (code, instructor_id, title, course_code, term_start, term_end, weeks, pace, course, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(code, instr.id, String(c.title).slice(0, 200), String(c.code || '').slice(0, 20), c.term.start, c.term.end, c.term.weeks | 0, String(c.plan.pace || ''), JSON.stringify(course), now());
  fs.writeFileSync(path.join(DATA, `${code}.material.json`), JSON.stringify({ text: m.text, sources: m.sources || [] }));
  return { status: 200, body: { code } };
}
// an original file (a PDF) for one source, raw bytes, so students see the pages the instructor saw
function putFile(instr, code, sourceId, bytes) {
  const row = db.prepare('SELECT instructor_id FROM cohorts WHERE code = ?').get(code);
  if (!row || row.instructor_id !== instr.id) return { status: 404, error: 'cohort not found' };
  if (!/^[\w-]{1,40}$/.test(sourceId)) return { status: 400, error: 'bad source id' };
  fs.writeFileSync(path.join(DATA, `${code}.${sourceId}.bin`), bytes);
  return { status: 200, body: { ok: true, bytes: bytes.length } };
}
function get(code) {
  const row = db.prepare('SELECT * FROM cohorts WHERE code = ?').get(code); if (!row) return null;
  return Object.assign(publicCohort(row, memberCount(code)), { course: JSON.parse(row.course) });
}
const material = (code) => { const f = path.join(DATA, `${code}.material.json`); return fs.existsSync(f) ? fs.readFileSync(f) : null; };
const file = (code, sourceId) => { if (!/^[\w-]{1,40}$/.test(sourceId)) return null; const f = path.join(DATA, `${code}.${sourceId}.bin`); return fs.existsSync(f) ? fs.readFileSync(f) : null; };

function join(code, body) {
  const row = db.prepare('SELECT * FROM cohorts WHERE code = ?').get(code); if (!row) return { status: 404, error: 'No cohort has that code.' };
  if (row.closed) return { status: 410, error: 'This cohort is closed to new students.' };
  if (!body.device || !body.name) return { status: 400, error: 'device and name required' };
  if (new Date(row.term_start + 'T00:00:00Z').getTime() < Date.now() - 86400000 && !db.prepare('SELECT 1 FROM members WHERE cohort = ? AND device = ?').get(code, body.device)) return { status: 410, error: `This cohort's term began ${row.term_start}; enrolment closed at the start of term.` };
  if (memberCount(code) >= 500) return { status: 429, error: 'This cohort is full.' };
  db.prepare('INSERT OR REPLACE INTO members (cohort, device, student_id, name, joined_at, progress, updated_at) VALUES (?, ?, ?, ?, COALESCE((SELECT joined_at FROM members WHERE cohort = ? AND device = ?), ?), COALESCE((SELECT progress FROM members WHERE cohort = ? AND device = ?), NULL), ?)')
    .run(code, body.device, String(body.studentId || '').slice(0, 40), String(body.name).slice(0, 80), code, body.device, now(), code, body.device, now());
  return { status: 200, body: { ok: true, cohort: publicCohort(row, memberCount(code)), roster: roster(code) } };
}
function progress(code, body) {
  if (!body.device || !body.progress || typeof body.progress !== 'object') return { status: 400, error: 'device and progress required' };
  const p = body.progress;
  const clean = { chunksDone: p.chunksDone | 0, chunksTotal: p.chunksTotal | 0, pct: Number.isFinite(p.pct) ? Math.round(p.pct * 10) / 10 : null, letter: p.letter ? String(p.letter).slice(0, 3) : null, streak: p.streak | 0, week: p.week | 0, papers: p.papers | 0, state: String(p.state || 'enrolled').slice(0, 12) };
  const r = db.prepare('UPDATE members SET progress = ?, updated_at = ? WHERE cohort = ? AND device = ?').run(JSON.stringify(clean), now(), code, body.device);
  if (!r.changes) return { status: 404, error: 'not a member' };
  return { status: 200, body: { ok: true, roster: roster(code) } };
}
function roster(code) {
  return db.prepare('SELECT device, name, student_id, joined_at, progress, updated_at FROM members WHERE cohort = ? ORDER BY joined_at').all(code)
    .map((m) => ({ device: sha(m.device).slice(0, 12), name: m.name, studentId: m.student_id, joinedAt: m.joined_at, updatedAt: m.updated_at, progress: m.progress ? JSON.parse(m.progress) : null }));
}
function list(instr) {
  return db.prepare('SELECT * FROM cohorts WHERE instructor_id = ? ORDER BY created_at DESC').all(instr.id).map((row) => Object.assign(publicCohort(row, memberCount(row.code)), { roster: roster(row.code) }));
}
function close(instr, code, closed) {
  const r = db.prepare('UPDATE cohorts SET closed = ? WHERE code = ? AND instructor_id = ?').run(closed ? 1 : 0, code, instr.id);
  return r.changes ? { status: 200, body: { ok: true } } : { status: 404, error: 'cohort not found' };
}

module.exports = { addInstructor, instructorByKey, create, putFile, get, material, file, join, progress, roster, list, close };
