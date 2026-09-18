# Lyceum

Any study material becomes a real university course: a registrar reads it, fixes a binding term
calendar, timetables lectures, schedules quizzes / problem sets / a midterm / a project / a final,
grades on a 4.0 scale and keeps a hash-chained permanent record. Single HTML file, no server.

- **Open** `dist/lyceum.html` in a browser (double-click), or install the hosted PWA from
  https://ibroawwad.github.io/lyceum/ (Safari/Chrome → *Add to Home Screen*). Everything is stored in that browser.
- **How a course is built:** upload → the registrar proposes three pacings by daily effort —
  Condensed (2 h/day, Mon–Sat), Standard (1 h/day, Mon–Fri), Extended (30 min/day, Mon–Fri); the term
  length follows from the material (a 600-page book is months, not weeks) → you pick one → binding. Every study day gets a block of 2–5 bite-sized chunks (read /
  review / practise); reading chunks open the **original pages** (PDF rendered as-is) with a Text toggle.
  Ticking chunks off on their day is the participation grade. Contents pages, prefaces and indexes are
  recognised and never scheduled.
- **Papers:** enrolment is a signed **registration contract** (typed name + drawn signature, hash in the ledger).
  A course completed at 70% or better earns a **certificate of completion** with the grade breakdown and your own
  signature — printable to PDF and shareable as an image. **Stats** shows streaks, completion and minutes per week.
- **Faculty (optional):** Settings → paste an OpenRouter key. Papers, grading and lecture notes then
  come from the model chain (`anthropic/claude-fable-5.1` → `claude-opus-5` → `claude-sonnet-5` →
  two free models). Without a key, or when the key has no credits, the offline examiner takes over.
- **Debug clock:** open `dist/lyceum.html?debug=1` to get `+1 h / +1 day / +1 week` controls in
  Settings. Every move is written to the ledger.

Everything (pdf.js, mammoth, marked, DOMPurify, Inter, EB Garamond) is bundled from `vendor/` — no CDN at runtime; the
app works fully offline. Ticking a reading chunk requires passing a two-question quick check from that chunk.
Legal pages live in `legal/` and are served next to the app.

Build from source: `npm run build`. Test: `npm test` (headless Chrome) and `npm run check` (node checks).
Contract: `SPEC.md`.

**Native wrapper (Capacitor):** `android/` and `ios/` are generated Capacitor projects around the same
`dist/`. `npm run mobile:android` opens Android Studio; `npm run mobile:ios` needs Xcode + CocoaPods
(`pod install` in `ios/App` once Xcode is installed — this machine only had the command-line tools).
