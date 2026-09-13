# Lyceum

Any study material becomes a real university course: a registrar reads it, fixes a binding term
calendar, timetables lectures, schedules quizzes / problem sets / a midterm / a project / a final,
grades on a 4.0 scale and keeps a hash-chained permanent record. Single HTML file, no server.

- **Open** `dist/lyceum.html` in a browser (double-click). Everything is stored in that browser.
- **Faculty (optional):** Settings → paste an OpenRouter key. Papers, grading and lecture notes then
  come from the model chain (`anthropic/claude-fable-5.1` → `claude-opus-5` → `claude-sonnet-5` →
  two free models). Without a key, or when the key has no credits, the offline examiner takes over.
- **Debug clock:** open `dist/lyceum.html?debug=1` to get `+1 h / +1 day / +1 week` controls in
  Settings. Every move is written to the ledger.

Build from source: `node tools/build.js`. Test: `node tools/smoke.js` (headless Chrome).
Contract: `SPEC.md`.
