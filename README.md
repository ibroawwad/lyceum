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

**Native apps (Capacitor 8):** `android/` and `ios/` (Swift Package Manager, no CocoaPods) wrap the same `dist/`.
`LYCEUM_API=https://api.<domain> npm run mobile:sync` builds with the server baked in; `npm run mobile:ios` /
`npm run mobile:android` open Xcode / Android Studio. Icons and splash screens come from `assets/` via
`npx capacitor-assets generate`. The app is free; each course enrolment is a one-time in-app purchase
(`com.lyceum.app.course`) verified by the server, which unlocks the faculty and a registered certificate for that
course. Store copy, screenshots (`node tools/shots.js`) and the release runbook live in `store/`.

## Cohorts
An instructor (a key issued on the server with `node admin.js add "Name"`, entered under More → Instructor) runs the
wizard in instructor mode, picks the pace and the Monday the term starts, and publishes the plan; students join with
the six-character code or the link, sign the same contract, and study the same term, days and papers. The Class tab
shows the roster's progress; the Teaching page shows every cohort. Nothing about a published term can be changed.

## Library
`server/library.json` is the catalogue (23 titles to start: OpenStax CC BY editions and public-domain classics from
Project Gutenberg). Note: OpenStax's *current* editions are CC BY-NC-SA; only the CC BY editions are listed because
courses are sold. The server turns each title into a compact pack (page text + bookmarks) once and cuts original
pages into small PDF slices on demand, so a phone never downloads a 250 MB textbook. Attribution is printed on the
prospectus, the Materials tab and the certificate.

## Server (`server/`)
A dependency-free Node 24 API (faculty proxy with our key + entitlement tokens, App Store / Play purchase
verification, public certificate verification at `/verify/<code>`, library catalogue). Deployed on its own with
`deploy/release.sh <host> [domain]`: user `lyceum`, `/srv/lyceum/app`, container `lyceum-api` on `127.0.0.1:4700`,
its own nginx block; nothing shared with any other service on the box. Config in `/srv/lyceum/app/.env`
(see `server/.env.example`). The build bakes the public address in (`LYCEUM_API`, today `https://api.146-190-139-68.sslip.io` until a domain exists); **More → Faculty → Lyceum server** overrides it.
