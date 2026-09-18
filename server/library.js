// Library: open-access titles served as compact "packs" (extracted page text + outline) so a phone never
// downloads a 250 MB textbook; original pages come as small PDF slices cut on demand with pdf-lib.
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const catalogue = require('./library.json');
const DATA = process.env.LIBRARY_DIR || path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, 'data', 'x')), 'library');
fs.mkdirSync(DATA, { recursive: true });
const ALLOWED_HOSTS = ['assets.openstax.org', 'www.gutenberg.org', 'standardebooks.org'];
const inflight = new Map();

const byId = (id) => catalogue.titles.find((t) => t.id === id);
const publicList = () => ({ titles: catalogue.titles.map(({ fileUrl, ...t }) => t) });

async function fetchOriginal(t) {
  const file = path.join(DATA, `${t.id}.${t.kind === 'pdf' ? 'pdf' : 'txt'}`);
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return file;
  const host = new URL(t.fileUrl).hostname; if (!ALLOWED_HOSTS.includes(host)) throw new Error('host not allowed');
  const r = await fetch(t.fileUrl, { headers: { 'User-Agent': 'Lyceum/1.0 (+library)' } });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 400 * 1024 * 1024) throw new Error('file too large');
  fs.writeFileSync(file, buf);
  return file;
}

async function extractPdf(file) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const data = new Uint8Array(fs.readFileSync(file));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p); const content = await page.getTextContent();
    let line = '', lastY = null; const buf = [];
    for (const it of content.items) { if (!('str' in it)) continue; const y = it.transform ? Math.round(it.transform[5]) : null; if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) { buf.push(line.trim()); line = ''; } line += it.str + (it.hasEOL ? '\n' : ' '); lastY = y; }
    buf.push(line.trim()); pages.push(buf.join('\n')); page.cleanup();
  }
  const outline = [];
  try {
    const walk = async (items, depth) => { for (const it of items || []) { let idx = null; try { const dest = typeof it.dest === 'string' ? await pdf.getDestination(it.dest) : it.dest; if (dest && dest[0]) idx = await pdf.getPageIndex(dest[0]); } catch (e) { /* skip */ } if (idx != null && it.title) outline.push({ title: it.title.replace(/\s+/g, ' ').trim(), page: idx + 1, depth }); if (it.items && depth < 2) await walk(it.items, depth + 1); } };
    await walk(await pdf.getOutline(), 0);
  } catch (e) { /* no outline */ }
  await pdf.destroy();
  return { pages, outline };
}

// the pack is built once per title and cached as JSON
async function pack(id) {
  const t = byId(id); if (!t) return null;
  const cached = path.join(DATA, `${id}.pack.json`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached, 'utf8');
  if (inflight.has(id)) return inflight.get(id);
  const job = (async () => {
    const file = await fetchOriginal(t);
    let body;
    const attribution = { title: t.title, author: t.author, publisher: t.publisher, license: t.license, licenseUrl: t.licenseUrl, url: t.sourceUrl };
    if (t.kind === 'pdf') { const { pages, outline } = await extractPdf(file); body = { id, kind: 'pdf', pages, outline, attribution }; }
    else { let text = fs.readFileSync(file, 'utf8'); text = stripGutenberg(text); body = { id, kind: 'text', text, attribution }; }
    const out = JSON.stringify(body);
    fs.writeFileSync(cached, out);
    return out;
  })().finally(() => inflight.delete(id));
  inflight.set(id, job);
  return job;
}
// Project Gutenberg wraps every text in a licence header and footer that must not be studied
function stripGutenberg(text) {
  const a = text.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const b = text.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK/i);
  if (a >= 0 && b > a) text = text.slice(text.indexOf('\n', a) + 1, b);
  return text.replace(/\r\n/g, '\n').trim();
}

// original pages: a small PDF containing pages from..to (1-based, inclusive, at most 20)
async function pageSlice(id, from, to) {
  const t = byId(id); if (!t || t.kind !== 'pdf') return null;
  from = Math.max(1, from | 0); to = Math.min(from + 19, to | 0);
  const cached = path.join(DATA, `${id}.p${from}-${to}.pdf`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  const file = await fetchOriginal(t);
  const src = await PDFDocument.load(fs.readFileSync(file), { ignoreEncryption: true });
  const n = src.getPageCount(); if (from > n) return null; to = Math.min(to, n);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i));
  copied.forEach((p) => out.addPage(p));
  const bytes = Buffer.from(await out.save({ useObjectStreams: true }));
  fs.writeFileSync(cached, bytes);
  return bytes;
}

module.exports = { publicList, pack, pageSlice, byId };
