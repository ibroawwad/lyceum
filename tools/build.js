#!/usr/bin/env node
// Concatenates src/* into dist/lyceum.html. Never hand-edit dist/.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = (f) => path.join(root, 'src', f);
const read = (f) => fs.readFileSync(src(f), 'utf8');

const ORDER = ['core.js', 'native.js', 'sample.js', 'intake.js', 'faculty.js', 'registrar.js', 'papers.js',
  'views-shell.js', 'views-course.js', 'views-misc.js', 'views-enrol.js'];

let html = read('shell.html');
const vendor = (f) => fs.readFileSync(path.join(root, 'vendor', f), 'utf8');
// libraries and fonts ship inside the file: no CDN, works offline and inside the native shells
const worker = vendor('pdf.worker.min.js');
const libs = ['pdf.min.js', 'mammoth.browser.min.js', 'marked.min.js', 'purify.min.js'].map((f) => `\n/* ---- vendor/${f} ---- */\n${vendor(f)}`).join('\n')
  + `\nwindow.__PDF_WORKER_SRC = ${JSON.stringify(worker)};`;
if (libs.includes('</script')) throw new Error('a vendor file contains "</script"');
html = html.replace('/* VENDOR */', () => libs);
html = html.replace('/* FONTS */', () => vendor('fonts/fonts-inline.css'));
html = html.replace('/* STYLES */', () => read('styles.css'));
const js = ORDER.filter((f) => fs.existsSync(src(f))).map((f) => `\n/* ---- ${f} ---- */\n${read(f)}`).join('\n');
if (js.includes('</script>')) throw new Error('a JS module contains "</script>" — split the string');
html = html.replace('/* SCRIPTS */', () => js);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'lyceum.html'), html);
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html); // hosting + Capacitor expect index.html
if (fs.existsSync(path.join(root, 'sw.js'))) fs.copyFileSync(path.join(root, 'sw.js'), path.join(root, 'dist', 'sw.js'));
for (const f of ['icon-512.png', 'icon-180.png']) if (fs.existsSync(src(f))) fs.copyFileSync(src(f), path.join(root, 'dist', f));
for (const f of ['privacy.html', 'terms.html']) if (fs.existsSync(path.join(root, 'legal', f))) fs.copyFileSync(path.join(root, 'legal', f), path.join(root, 'dist', f));
const missing = ORDER.filter((f) => !fs.existsSync(src(f)));
console.log(`built dist/lyceum.html (${(html.length / 1024).toFixed(0)} KB)` + (missing.length ? ` — missing modules: ${missing.join(', ')}` : ''));
