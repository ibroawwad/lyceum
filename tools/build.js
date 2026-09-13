#!/usr/bin/env node
// Concatenates src/* into dist/lyceum.html. Never hand-edit dist/.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = (f) => path.join(root, 'src', f);
const read = (f) => fs.readFileSync(src(f), 'utf8');

const ORDER = ['core.js', 'sample.js', 'intake.js', 'faculty.js', 'registrar.js',
  'views-shell.js', 'views-course.js', 'views-misc.js', 'views-enrol.js'];

let html = read('shell.html');
const fonts = fs.existsSync(src('fonts.txt')) ? read('fonts.txt').trim() : '';
html = html.replace('<!-- FONTS -->', fonts ? `<link rel="stylesheet" href="${fonts}">` : '');
html = html.replace('/* STYLES */', () => read('styles.css'));
const js = ORDER.filter((f) => fs.existsSync(src(f))).map((f) => `\n/* ---- ${f} ---- */\n${read(f)}`).join('\n');
if (js.includes('</script>')) throw new Error('a JS module contains "</script>" — split the string');
html = html.replace('/* SCRIPTS */', () => js);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'lyceum.html'), html);
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html); // hosting + Capacitor expect index.html
if (fs.existsSync(path.join(root, 'sw.js'))) fs.copyFileSync(path.join(root, 'sw.js'), path.join(root, 'dist', 'sw.js'));
const missing = ORDER.filter((f) => !fs.existsSync(src(f)));
console.log(`built dist/lyceum.html (${(html.length / 1024).toFixed(0)} KB)` + (missing.length ? ` — missing modules: ${missing.join(', ')}` : ''));
