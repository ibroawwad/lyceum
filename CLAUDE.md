# Lyceum

Single-file study-course app. Read `SPEC.md` (the binding contract) and `DESIGN.md` (visual
direction) before touching anything. Build with `node tools/build.js`; test with
`node tools/smoke.js` (headless Chrome via playwright-core, `channel: 'chrome'`). Never hand-edit
`dist/`. Plain ES2020, no modules, every JS file wrapped in `(function (L) { 'use strict'; … })(window.L);`.
`node --check src/<file>.js` before you finish a file. Do not edit `src/sample.js`, `tools/build.js`,
or `src/shell.html` unless the task says so.
