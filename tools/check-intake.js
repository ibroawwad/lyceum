const fs = require('fs'); const vm = require('vm');
const ctx = { window: {}, console, crypto: globalThis.crypto, TextEncoder, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: { readyState: 'complete', addEventListener() {}, querySelector: () => null, documentElement: { setAttribute() {}, removeAttribute() {} } }, location: { search: '', hash: '' }, indexedDB: undefined, setInterval() {}, addEventListener() {} };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['core.js', 'sample.js', 'intake.js']) vm.runInContext(fs.readFileSync('src/' + f, 'utf8'), ctx, { filename: f });
const L = ctx.L;
const text = L.intake.normalize(L.SAMPLE.text);
const segs = L.intake.segment(text);
console.log('segments:', segs.map(s => `${s.i}:${s.title} (${s.words}w)`).join(' | '));
segs.forEach(s => { const head = text.slice(s.start, s.start + 40).replace(/\n/g, '⏎'); console.log('  ', s.i, JSON.stringify(head)); });
console.log('terms:', L.intake.keyTerms(text, 15).join(', '));
const a = L.intake.analyzeOffline({ text, segments: segs, hint: '' });
console.log('analysis:', a.title, a.subjectCode, a.level, a.difficulty, a.units.map(u => `${u.title} [${u.segments}] rs=${u.relativeSize}`));
console.log(a.units[0].objectives);
// headingless
const big = Array.from({ length: 60 }, (_, i) => 'This is paragraph number ' + i + '. ' + 'Cells divide by mitosis and grow by absorbing nutrients from their environment over time. '.repeat(8)).join('\n\n');
console.log('chunked:', L.intake.segment(big).map(s => `${s.title}:${s.words}`).join(', '));
const hdr = ('Course Notes p.\n' + 'Momentum is conserved when no external force acts on the system of particles under study. '.repeat(5) + '\n\n').repeat(6);
console.log('header removed:', !L.intake.normalize(hdr).includes('Course Notes p.'));
console.log('hyphen:', L.intake.normalize('the proba-\nbility of').includes('probability'));
