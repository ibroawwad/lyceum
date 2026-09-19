# Lyceum — build contract

Lyceum is a single-file web app (`dist/lyceum.html`) that turns any study material into a
real university course: a registrar reads the material, fixes a term calendar, timetables
lectures, schedules quizzes / problem sets / a midterm / a project / a final, and grades the
student on a top-tier scale. **The student cannot move a date, reopen an exam, or change a
weight.** Everything runs in the browser: no server, one student record per device, an
OpenRouter key for the "faculty" (LLM), and a full offline fallback so the app never dead-ends.

This document is the contract every module is written against. Names here are binding.
If something is unspecified, choose the option a careful engineer at a top university's
registrar would choose, and keep the invariants below.

---

## 1. Invariants (never violate)

1. **Binding schedule.** Once a course is enrolled, `course.term`, `course.weeks`,
   `course.sessions`, every assessment's `opensAt / dueAt / closesAt / durationMin / weight`,
   and `course.policy` are frozen. No view offers a control that edits them. No function other
   than `L.registrar.enrol` writes them.
2. **Real clock.** All time comes from `L.now()` (real time plus `S.clock.offsetMs`). The offset
   can only be changed in debug mode (`?debug=1` in the URL query, before the hash) and every
   change is written to the ledger. A `Reset clock` control is always allowed.
3. **One attempt.** An assessment has at most one attempt. Starting it seals the paper. Leaving
   the page does not stop the timer. A missed assessment is graded 0 and recorded.
4. **Nothing silent.** Every state transition that affects the record (enrol, withdraw, attend,
   start, submit, grade, miss, complete, clock override) is a ledger entry (hash-chained).
5. **Faculty is optional.** Every LLM job has a deterministic offline fallback that produces a
   usable result and is labelled as such (`source: 'offline'`). The app never blocks on a key.
6. **Human, not slop.** Copy is written from the student's side, specific, active voice, no
   emoji, no "AI-powered". Errors say what happened and what to do.
7. **No timetable clash.** Sessions of concurrent courses never overlap in time; exam days of
   concurrent courses never coincide; total weekly load never exceeds the study budget.

---

## 2. Files and build

```
src/
  shell.html        page skeleton: <head> (fonts, CDN libs), <body> with #app, placeholders
  styles.css        the whole design system (tokens + components + views + print)
  core.js           namespace, utils, state/store, IndexedDB, clock, ledger, formatting, ui helpers
  sample.js         built-in sample material (already written — do not edit)
  intake.js         file/url parsing, normalisation, segmentation, key terms, offline analysis
  faculty.js        OpenRouter client + model chain, prompts, JSON extraction, offline paper/grade
  registrar.js      planner/scheduler, enrolment, standing/GPA, assessment lifecycle, exam engine, sweep
  views-shell.js    layout, rail, router, action dispatch, toasts/modals, welcome, today
  views-course.js   course list, course page (syllabus/assessments/grades/materials), reading view, exam room
  views-misc.js     calendar (month + weekly timetable), record (transcript + ledger), settings
  views-enrol.js    enrolment wizard
tools/build.js      concatenates src/* into dist/lyceum.html (already written — do not edit)
tools/smoke.js      headless-Chrome scenario test (already written — extend, don't weaken)
dist/lyceum.html    the deliverable (generated; never hand-edit)
```

Concatenation order (build.js): `core, sample, intake, faculty, registrar, views-shell, views-course,
views-misc, views-enrol`. Every JS file is wrapped by the author as

```js
(function (L) {
  'use strict';
  // ...
})(window.L);
```

`core.js` creates `window.L` first. No ES modules, no bundler, no TypeScript, no framework.
ES2020 is fine (optional chaining, `??`, async/await). Run `node --check src/<file>.js` before
finishing a file. Run `node tools/build.js && node tools/smoke.js` to test the whole thing.

Libraries and fonts are bundled from `vendor/` at build time (no CDN at runtime; the pdf.js worker is handed over as a blob). Still guard the globals:
- `pdfjsLib` — pdf.js 3.11.174 (`pdfjsLib.GlobalWorkerOptions.workerSrc` is set in shell.html)
- `mammoth` — 1.6.0 (docx → text)
- `marked` — 12.0.2, `DOMPurify` — 3.1.6 (render lecture notes markdown safely)

Fonts are Google Fonts, linked in shell.html; the design direction (`DESIGN.md`) names them.

---

## 3. Namespace and module surface

All modules attach to `window.L`. Nothing else is global.

### core.js

```js
L.S                         // the state object (see §4); loaded synchronously at boot
L.VERSION = 1
L.debug                     // boolean: URL query has ?debug=1
L.now() → ms                // Date.now() + (L.S.clock.offsetMs || 0)
L.today() → Date            // start of today (local) per L.now()
L.clock.setOffset(ms)       // debug only (throws otherwise); ledger 'clock_override'; L.save()
L.clock.reset()             // always allowed; ledger 'clock_reset' if it changed
L.save()                    // persist L.S to localStorage key 'lyceum.v1' (debounced 150ms, sync flush on pagehide)
L.load()                    // read + migrate; returns L.S (called once at boot)
L.reset()                   // wipe state + materials (used by settings "Erase this device")
L.uid(prefix?) → string     // e.g. 'a_k3j9x2'
L.esc(str) → string         // HTML-escape text AND attribute values (&, <, >, ", ')
L.clamp(n, lo, hi), L.sum(arr), L.by(key) (sort comparator), L.groupBy(arr, fn)
L.sha256(str) → Promise<hex>          // crypto.subtle
L.date.parse(iso) → Date              // ISO string or ms → Date
L.date.iso(d) → 'YYYY-MM-DD'          // local date
L.date.startOfDay(d), L.date.addDays(d, n), L.date.addMin(d, n), L.date.setTime(d, h, m)
L.date.nextMonday(from = L.today())   // next Monday strictly after today unless today is Monday
                                      //   and it is before 08:00 local (then today)
L.date.dow(d) → 0..6 with Monday = 0
L.fmt.date(d) → 'Thu 12 Sep'          L.fmt.dateLong(d) → 'Thursday, 12 September 2026'
L.fmt.time(d) → '14:32'               L.fmt.dt(d) → 'Thu 12 Sep, 14:32'
L.fmt.rel(ms) → 'in 2d 4h' | '3h ago' | 'in 12 min' | 'now'
L.fmt.dur(min) → '1 h 15 min' | '50 min'
L.fmt.pct(n) → '87.5%' (one decimal, tabular)   L.fmt.num(n) → '18,420'
L.db.putMaterial(courseId, text) → Promise      // IndexedDB 'lyceum' / store 'materials'
L.db.getMaterial(courseId) → Promise<string|null>
L.db.deleteMaterial(courseId) → Promise
L.db.allMaterials() → Promise<Record<id,string>>
L.ledger.append(type, detail = {}) → Promise<entry>   // see §4 ledger; serialised through a queue
L.ledger.verify() → Promise<{ ok: boolean, brokenAt: number|null }>
L.ui.toast(message, kind = 'info'|'good'|'warn'|'bad', ms = 3200)
L.ui.confirm({ title, body, ok = 'Confirm', cancel = 'Cancel', danger = false }) → Promise<boolean>
L.ui.modal({ title, body(html), actions:[{label, act, primary}] , wide }) / L.ui.closeModal()
L.ui.busy(label) → { update(label), done() }         // full-width progress strip with a log line
L.emit(event, payload) / L.on(event, fn)              // tiny event bus ('state', 'route', 'tick')
```

Boot (core.js, at the end): `L.load()`; set `L.debug`; install `beforeunload/pagehide` flush;
start a 1 s `tick` emitter (used by clocks/timers) and a 20 s `sweep` timer that calls
`L.registrar.sweep()` if defined. The router itself lives in views-shell.js and boots on
`DOMContentLoaded` (call `L.boot()` defined there).

### intake.js

```js
L.intake.fromFile(file: File) → Promise<Source>       // pdf (pdfjsLib), docx (mammoth), md/txt/html
L.intake.fromUrl(url) → Promise<Source>               // direct fetch, then https://r.jina.ai/<url>; html → text
L.intake.fromText(text, name = 'Pasted text') → Source
L.intake.normalize(text) → text                       // CRLF→LF, de-hyphenate line-broken words,
                                                      // collapse >2 blank lines, strip repeated running headers/footers, trim
L.intake.words(text) → number
L.intake.segment(text) → Segment[]                    // see §7
L.intake.keyTerms(text, n = 40) → string[]            // ranked; stopwords removed; keeps multiword Capitalised phrases
L.intake.analyzeOffline({ text, segments, hint }) → Analysis   // see §7
```
`Source = { id, name, kind:'pdf'|'docx'|'text'|'markdown'|'html'|'url', text, words, chars, pages? , url? }`
Errors: throw `Error` with a student-readable message (`'That PDF has no extractable text (it may be scanned). Try a text export.'`).

### faculty.js

```js
L.faculty.MODELS = [                                  // fallback chain, in order
  'anthropic/claude-fable-5.1', 'anthropic/claude-opus-5', 'anthropic/claude-sonnet-5',
  'nvidia/nemotron-3-ultra-550b-a55b:free', 'google/gemma-4-31b-it:free' ]
L.faculty.available() → boolean                       // S.settings.apiKey non-empty
L.faculty.chain() → string[]                          // [S.settings.model, ...MODELS without dupes]
L.faculty.call({ task, system, user, maxTokens = 6000, json = true, temperature = 0.3, onModel? })
   → Promise<{ data?, text?, model, ms }>
   // POST https://openrouter.ai/api/v1/chat/completions with Authorization: Bearer <key>,
   // 'HTTP-Referer': 'https://lyceum.local', 'X-Title': 'Lyceum'. Try each model in chain();
   // on HTTP 401 stop (bad key). On 402/404/408/429/5xx/network/timeout(90 s)/unparseable JSON
   // move to the next model. json=true → extract the LAST balanced JSON object/array from the
   // content (strip ```fences; ignore reasoning prose). Throw FacultyError { reason, tried[] }
   // when the chain is exhausted. onModel(modelId) is called before each try (for progress logs).
L.faculty.test() → Promise<{ ok, model, ms, error? }> // one tiny call; used by Settings
L.faculty.analyze({ segments, text, hint, words }) → Promise<{ analysis, source:'llm'|'offline', model? , note? }>
L.faculty.composePaper({ course, assessment, text }) → Promise<{ paper, source, model?, note? }>
L.faculty.grade({ course, assessment, paper, answers }) → Promise<{ results, source, model?, note? }>
L.faculty.notes({ course, week, text }) → Promise<{ markdown, source, model?, note? }>
L.faculty.offline = { analyze, composePaper, grade, notes }   // the deterministic versions
```
`analyze / composePaper / grade / notes` try the LLM when `available()`, otherwise (or on
FacultyError) use `offline.*` and set `note` to a one-line explanation for the UI
(e.g. `'Faculty unavailable (402 – no credits on anthropic/claude-fable-5.1; 429 on …). Paper set by the offline examiner.'`).
Never throw from these four; only `call` and `test` throw.

Prompts (author them in faculty.js, in this spirit):
- **analyze** — system: senior faculty at a top-tier university designing a course from supplied
  material; return strict JSON only. User: `hint` title (if any), word count, and the segment
  list `[i] "title" (words) — excerpt(≤500 chars)`. Ask for
  `{ title, subjectCode(2–4 uppercase letters), subject, level:'introductory'|'intermediate'|'advanced',
     difficulty:1..5, description(≤2 sentences), prerequisites:[…], units:[{ title, segments:[from,to],
     topics:[3..6], objectives:[2..4 measurable, Bloom verbs], relativeSize:1..5 }] }`.
  Units must be contiguous, in order, and cover every segment index. Validate and repair
  (§7.4) before returning.
- **composePaper** — system: you set examinations for a top-tier university; every question
  must be answerable from the material and test understanding, not phrasing; strict JSON.
  User: course title, assessment kind/title, the covered unit titles & objectives, the material
  excerpt (≤ 60,000 chars, sampled evenly across covered segments), and the required mix (§8.3).
- **grade** — system: rigorous, fair grader; award partial credit against the rubric; feedback
  in two sentences, specific to what the student wrote; strict JSON
  `{ results:[{ id, points, feedback }] }`.
- **notes** — lecture notes for one week in markdown (headings, worked examples, a short
  "check yourself" list). Not JSON.

### registrar.js

```js
L.registrar.budget() → { weekly, committed, available }          // hours; committed = Σ active/upcoming course.plan.hoursPerWeek
L.registrar.PACES                                                 // { condensed, standard, extended } → { label, hpwCap, studyDays, blurb }
L.registrar.plans({ analysis, segments, text, sources, words }) → { condensed, standard, extended }   // pure; each a Prospectus or { unavailable }
L.registrar.plan(input) → Prospectus                              // = plans(input).standard
L.registrar.locate(course, from, to) → { source, pages:[a,b]|null } // char range → original page range
L.registrar.enrol(prospectus) → Promise<Course>                  // writes course, stores material, ledger 'enrolled'
L.registrar.withdraw(courseId) → Promise<void>                   // allowed before 60% of term; ledger 'withdrawn'
L.registrar.course(id) → Course | undefined
L.registrar.courses(filter = 'all'|'active'|'past') → Course[]   // active = upcoming|running
L.registrar.courseState(course) → 'upcoming'|'running'|'completed'|'withdrawn'
L.registrar.currentWeek(course) → number                          // 1-based; 0 before start; weeks+1 after end
L.registrar.week(course, n) → Week
L.registrar.sessionsOn(date) → { course, session }[]              // all courses, sorted by start
L.registrar.deadlines({ from, to }) → { course, assessment, at }[] // dueAt in range, sorted
L.registrar.assessmentState(course, a) → 'upcoming'|'open'|'late'|'in_progress'|'submitted'|'graded'|'missed'
L.registrar.deadline(course, a) → ms | null                       // hard end of an in-progress timed attempt
L.registrar.standing(course) → Standing                           // §8.6
L.registrar.letter(pct) → 'A'…'F'   L.registrar.points(letter) → 4.0…0
L.registrar.gpa() → { gpa, credits, completed }                   // completed courses only
L.registrar.complete(courseId, sessionId, chunkId) → Promise<'done'|'late'|'not_yet'|'already'>  // ledger 'chunk_completed' { onTime }
L.registrar.begin(courseId, aid, { onLog }) → Promise<void>       // seals paper (faculty.composePaper), sets attempt.startedAt, ledger
L.registrar.answer(courseId, aid, qid, value)                     // autosave into attempt.answers; L.save()
L.registrar.submit(courseId, aid, { auto = false }) → Promise<Grade>  // grades, penalties, ledger
L.registrar.sweep() → Promise<void>                               // misses, auto-submits, completions (§8.7)
L.registrar.nextDeadline() → { course, assessment, at } | null
L.registrar.load(week?) → { hours, budget }                       // this week's committed hours
```

### views-*.js

```js
L.views[name] = { title, render(params) → html, mount?(root, params), unmount?() }
L.actions[name] = (el, ev) → void|Promise      // click on any [data-act=name]; extra args in data-* attributes
L.inputs[name]  = (el, ev) → void              // 'input'/'change' on any [data-in=name]
L.go(path)                                     // set location.hash ('#/course/c_x')
L.route() → { name, params, query }
L.render()                                     // re-render rail + main for the current route (views-shell.js)
L.boot()                                       // views-shell.js: attach listeners, first render, redirect to #/welcome if no student
```
Routes: `#/welcome`, `#/today`, `#/courses`, `#/course/:id` (+ `?tab=syllabus|assessments|grades|materials`),
`#/course/:id/day/:date` (+ `?chunk=id&view=pages|text`, the study block and its original pages; `/week/:n` redirects), `#/assess/:id/:aid`, `#/calendar` (+ `?m=YYYY-MM`),
`#/record`, `#/enrol`, `#/settings`.

---

## 4. State (`L.S`) — exact shape

```js
{
  version: 1,
  student: null | { id:'LYC-24-0417', name, createdAt },      // id: 'LYC-' + 2-digit year + '-' + 4 digits
  settings: { apiKey:'', model:'anthropic/claude-fable-5.1', weeklyHours:12, theme:'system'|'light'|'dark' },
  clock: { offsetMs: 0 },
  courses: Course[],
  ledger: LedgerEntry[],
  ui: { collapsed:{}, lastRoute:'' }
}

Course = {
  id:'c_…', code:'PROB 201', title, subject, subjectCode, level, difficulty:1..5, description,
  prerequisites:[], credits:1..4, color:'#4ade80', createdAt,
  state: 'enrolled'|'withdrawn',            // completion is derived from dates (courseState)
  withdrawnAt?: iso,
  material: { sources:[{ id, name, kind, words, chars, pages?, url?, offset, pageStarts?, hasFile }], words, chars, segments: Segment[] },
              // offset = where this source starts in the joined material text; pageStarts = char offset of each PDF page; originals live in IndexedDB 'files'
  analysis: { source:'llm'|'offline', model?, note? , units: Unit[] },
  term: { start:'YYYY-MM-DD', end:'YYYY-MM-DD', weeks: n },      // end = Sunday of last week
  plan: { pace:'condensed'|'standard'|'extended', paceLabel, hoursPerWeek, totalHours, slot:{ days:[…studyDays], start: 540, minutes }, studyDays:[0..6], minutesPerDay, sessionsPerWeek },
  weeks: Week[],
  sessions: Session[],
  assessments: Assessment[],
  policy: { weights:{ quiz, pset, midterm, final, project, participation },   // integers summing to 100; absent kinds = 0
            late:{ perDayPct:10, maxDays:3 }, scale: 'standard', withdrawBefore:'YYYY-MM-DD' },
  notes: { [weekN]: { markdown, source, model?, at } },
  final?: { pct, letter, at },               // written by sweep when the term ends (or on withdraw: letter 'W')
  contract: { no:'LYC-C-<year>-<seq>', signedAt, name, signature: 'data:image/png;base64,…', textHash },   // signed at enrolment (papers.js)
  certificate?: { no:'LYC-<year>-<5 digits>', issuedAt, letter, pct, credits, breakdown:[{kind,weight,avg}], hash, code }  // issued by sweep at ≥ 70%
}
Unit = { title, segments:[from,to], topics:[], objectives:[], relativeSize }
Segment = { i, title, start, end, words, role:'front'|'body'|'back', subheads:[{ title, at }] }   // subheads name chunks; only body segments are scheduled
Week = { n, start:'YYYY-MM-DD', title, parts:[{ unit:idx, fraction:0..1, label:'Unit 3 · Cont.' }],
         segments:[i…], objectives:[], kind:'teaching'|'midterm'|'final' }
Session = { id, week, day:0..6, date:'YYYY-MM-DD', start:540, minutes, kind:'Study block', topic, chunks: Chunk[] }  // one per study day
Chunk = { id, kind:'read'|'practise'|'review', title (≤ 64 chars), hint?, minutes:5..25 (practise ≤ 30, review 6–8), ago? (review: study days since the reading), done: null|iso,
          segment?, from?, to? (char offsets, read only), pages?:[a,b]|null, source?: sourceId }
Assessment = { id, kind:'quiz'|'pset'|'midterm'|'final'|'project', title, week, coversWeeks:[…],
               opensAt: iso, dueAt: iso, closesAt: iso, durationMin: number|null, lateAllowed: boolean,
               paper: null | Paper, attempt: null | { startedAt, answers:{ [qid]: value }, submittedAt: null|iso, auto?:boolean },
               grade: null | Grade }
Paper = { id, generatedAt, source:'llm'|'offline', model?, note?, seal:hex,     // seal = sha256 of questions JSON
          questions: Question[] , brief?: markdown (projects) }
Question = { id, type:'mcq'|'short'|'problem'|'essay', prompt, options?:[4 strings], answer?:0..3,
             modelAnswer?, rubric?, points }
Grade = { pct, points, max, rawPct, late:{ days, penaltyPct }, missed:boolean, source, model?,
          results:[{ id, points, max, feedback }], at, letter }
LedgerEntry = { i, t: iso, type, courseId?, ref?, detail:{}, prev: hex|'0', hash: hex }
   // hash = sha256(prev + '|' + JSON.stringify({ i, t, type, courseId, ref, detail })) with keys in that order
Standing = { current: pct|null, projected: pct|null, letter, categories:[{ kind, weight, done, total, avg, contrib }],
             participation:{ attended, held } }
```

Ledger types: `matriculated, contract_signed, enrolled, withdrawn, chunk_completed, certificate_issued, assessment_started, assessment_submitted,
assessment_graded, assessment_missed, course_completed, clock_override, clock_reset, settings_changed, data_imported`.

---

## 5. Design system — class vocabulary (styles.css implements; views use only these + tokens)

Tokens on `:root` (light), overridden by `@media (prefers-color-scheme: dark)` guarded with
`:root:not([data-theme="light"])`, and by `:root[data-theme="dark"]`:
`--paper --surface --surface-2 --ink --ink-2 --muted --line --line-2 --accent --accent-ink --accent-soft
 --good --warn --bad --focus --shadow --radius --radius-sm --font-display --font-body --font-mono
 --course-s --course-l` (course colours are `hsl(var(--ch) var(--course-s) var(--course-l))`, `--ch` set inline per course).

Layout: `.app` (grid: rail + main), `.rail`, `.rail-brand`, `.rail-nav`, `.rail-nav a[aria-current=page]`,
`.rail-foot`, `.main`, `.page` (max-width 1180, padding), `.page-head` (eyebrow + h1 + lede + actions),
`.eyebrow` (mono caps), `.lede`, `.grid-2`, `.grid-3`, `.cols` (flex row gap), `.stack` (flex col gap),
`.section` + `.section-head`, `.card` + `.card-head` + `.card-body`, `.panel` (quieter than card),
`.divider`.
Type: `h1.display`, `.serif`, `.mono`, `.num` (tabular-nums), `.small`, `.muted`, `.label` (caps).
Controls: `.btn`, `.btn-primary`, `.btn-quiet`, `.btn-danger`, `.btn-sm`, `.btn[disabled]`, `.input`,
`.textarea`, `.select`, `.field` (label + control + hint), `.switch`, `.check` (checkbox row), `.drop`
(drop zone, `.is-over`), `.progress` + `.progress > i` (bar), `.log` (mono running log).
Data: `.table` (ledger-style hairline rows, th caps), `.table .num`, `.row-muted`, `.kv` (dl label/value),
`.tile` (big number tile: `.tile-n`, `.tile-l`), `.chip[data-state=upcoming|open|late|in_progress|submitted|graded|missed|good|warn|bad|neutral]`,
`.dot` (course dot uses `--ch`), `.code` (course code lockup), `.pill`, `.meter` (grade meter).
Views: `.today-grid`, `.agenda` + `.agenda-item` (time | dot+code | title | action), `.due-list`,
`.syllabus` + `.week-row` (week n | dates | topic + parts | sessions | due), `.week-row.is-current`,
`.assess-table`, `.reading` (measure ~68ch, serif body, `.reading-src` label), `.exam` + `.exam-bar`
(sticky timer strip) + `.question` + `.options` + `.answer`, `.result` + `.result-q`, `.calendar`
(7-col month grid: `.cal-day`, `.cal-day.is-today`, `.cal-day.is-other`, `.cal-ev`, `.cal-ev.is-due`),
`.timetable` (7 columns × 08:00–21:00 rows; `.tt-block` absolutely placed with `--ch`), `.transcript`,
`.ledger-list`, `.wizard` + `.wizard-steps` + `.wizard-step.is-active`, `.prospectus` (read-only course
sheet: header lockup, meta rows, assessment table, policy box), `.empty` (composed empty state),
`.toast-host` + `.toast[data-kind]`, `.modal-host` + `.modal`, `.busy` (progress strip).
Utilities: `.right`, `.center`, `.nowrap`, `.truncate`, `.mt-1..4`, `.mb-1..4`, `.gap-1..3`, `.w-full`, `.sr-only`.
Print: `@media print` hides rail/controls; `.transcript` prints cleanly.
Motion: respect `prefers-reduced-motion`. Focus: visible `:focus-visible` ring everywhere.

The direction (fonts, palette values, radii, the one bold move) comes from `DESIGN.md`.

---

## 6. Views — what each must contain

- **welcome** (`#/welcome`, only when `S.student` is null): matriculation — name field, a short
  statement of the rules (binding schedule, one attempt, real clock, record is permanent), primary
  `Matriculate`. Creates `S.student` (ledger `matriculated`) → `#/today`.
- **today**: page-head eyebrow `THURSDAY, 12 SEPTEMBER 2026 · WEEK 3 OF TERM`, h1 greeting by
  time of day + first name, lede summarising the day (n sessions, next deadline). Left: *Today*
  agenda (sessions with `Attend` → reading view; marks attended only on the day), *Open now*
  (assessments in `open|late|in_progress` with `Begin`/`Resume`/`Submit late`), *Due in the next
  7 days*. Right: *Standing* (GPA tile, per-course current % + letter + chip), *This week's load*
  (progress hours/budget), *Notices* (missed, late, clock offset). Empty state when no courses:
  composed intro + `Enrol in a course` + `Load the sample course` (runs the enrol pipeline on
  `L.SAMPLE` offline/LLM exactly like a real enrolment).
- **courses**: list/cards of all courses: code lockup, title, state chip, term dates, week n/N,
  standing letter, `Withdraw` (before `policy.withdrawBefore`, confirm dialog).
- **course**: header lockup (code, title, credits, level, term, hours/week, slot), tabs:
  *Syllabus* (week rows; current week highlighted; each row: topic, parts, objectives (collapsed),
  sessions with attended ticks, what opens/is due), *Assessments* (table: title, kind, opens,
  due, duration, weight share, state chip, score, action), *Grades* (standing: current, projected,
  category breakdown with contributions, letter scale, late policy, registrar's note that
  weights and dates are fixed), *Materials* (sources with counts, unit outline, `Faculty:
  llm/offline` note). Also `Withdraw` where allowed.
- **reading** (`#/course/:id/week/:n`): the week's material (its segments, from IndexedDB) in a
  measured serif column with segment titles as headings; objectives up top; `Lecture notes`
  button (faculty.notes, cached in `course.notes[n]`, rendered via marked + DOMPurify);
  prev/next week. Attending a session lands here.
- **assess** (`#/assess/:id/:aid`): three states.
  *Before*: title, kind, covers, opens/due/duration, honour pledge checkbox, `Begin` (disabled
  until open; label shows countdown when upcoming; `Submit late (−10 %/day)` when late and
  allowed). Projects show the brief first.
  *Exam room*: sticky `.exam-bar` with title, question count, and a live timer (mm:ss, turns
  `warn` under 5 min, `bad` under 1 min) or "untimed · due …"; questions with `.options`
  radios / `.answer` textareas; autosave on input (`data-in=answer`); `Submit paper` with
  confirm listing unanswered count. When the deadline passes, auto-submit and show the result.
  *Result*: score, letter, penalty if late, per-question feedback (correct option shown for mcq),
  model answer for short/problem, `source` note (offline examiner / model id).
- **calendar**: month grid (nav prev/next, `Today`) with sessions (time + code) and deadlines
  (`.is-due`, bold) coloured by course; below it the *weekly timetable* (Mon–Sun × 08:00–21:00)
  showing the current week's blocks — this is where non-clash is visible.
- **record**: transcript (student, id, matriculated on; table of courses: code, title, credits,
  term, grade letter or `IP` / `W`; GPA + credits earned), then the ledger (latest first, 60
  rows, `type`, detail summary, time, 8-char hash) with `Verify chain` → good/bad toast.
  `Print` button (window.print()).
- **enrol**: wizard. Step 1 *Material* — drop zone (pdf/docx/txt/md/html, multiple), paste
  textarea + `Add text`, URL field + `Fetch`; list of sources with words/pages and remove;
  optional title hint; total words. Step 2 *Registrar* — `Submit to the registrar` runs:
  normalise → segment → faculty.analyze (log lines: "Reading 3 sources · 18,420 words",
  "Consulting faculty (anthropic/claude-fable-5.1)…", "Faculty replied in 14.2 s" or the
  fallback note) → registrar.plan → *Prospectus* (read-only): code/title/credits, description,
  level/difficulty, term dates, weeks, hours per week and the timetable slot, unit outline by
  week, assessment table with exact opens/due, weights, late policy, withdrawal deadline, and a
  boxed registrar's note: "This schedule is binding. Dates, weights and examinations cannot be
  changed after enrolment." Buttons `Enrol` (confirm) / `Discard`. If the budget is too small,
  show the registrar's refusal with the number of free hours and the date the next course ends.
- **settings**: *Faculty* (API key password field, model select from MODELS + free text, `Test
  connection` → result line), *Study budget* (weekly hours 4–40; note: applies to future
  enrolments only), *Appearance* (system/light/dark), *Data* (`Export record` → JSON download
  including materials; `Import` file; `Erase this device` with typed confirmation),
  *Students* (placeholder card: "This device holds one student record. Multi-student accounts
  arrive with the server release." with a disabled `Add student`), *Registrar clock* (only in
  debug: offset display, +1 h, +1 day, +1 week, `Reset`; outside debug show only the warning +
  `Reset` when offset ≠ 0).

---

## 7. Intake rules

### 7.1 Parsing
- pdf: `pdfjsLib.getDocument({ data: arrayBuffer })`, join items per page with spaces, pages with
  `\n\n`; if total text < 200 chars → throw the "no extractable text" error.
- docx: `mammoth.extractRawText({ arrayBuffer })`.
- html (file or url): strip `script/style/nav/footer/header/aside`, convert `h1–h6` to markdown
  `#` headings, `li` to `- `, paragraphs separated by blank lines; use a DOMParser.
- url: `fetch(url)` (10 s) → if it fails or is not text, `fetch('https://r.jina.ai/' + url)`.
  Both failing → throw `'Could not fetch that page (blocked by the site or offline). Save it as PDF or paste the text.'`

### 7.2 Segmentation (`segment`)
1. Split into lines; drop lines that repeat ≥ 4 times verbatim and are < 90 chars (running headers, page numbers).
2. A heading is a line that is < 90 chars, has no terminal `.`, is not all digits, and matches one of:
   markdown `^#{1,4}\s`; `^(chapter|unit|part|section|lecture|module|lesson|week)\s+[0-9ivx]+`i;
   numbered `^\d{1,2}(\.\d{1,2}){0,2}\s+[A-Z]`; ALL CAPS with ≥ 2 words; Title Case with 2–10 words
   followed by a blank line or a line ≥ 100 chars.
3. If 3 ≤ headings ≤ 400 and the median words between headings ≥ 60: segments are the spans
   from each heading to the next (text before the first heading becomes segment "Front matter"
   only if ≥ 120 words, else it joins the first segment). Merge any segment < 80 words into its
   neighbour. If more than 60 segments remain, merge adjacent segments (smallest first) down to 60.
4. Otherwise: chunk by paragraphs into ~1,200-word segments titled `Part n`.
Result: `{ i, title, start, end, words }` with `start/end` char offsets into the normalised text.

### 7.2b Front and back matter (`classify`)
Titles matching contents / preface / foreword / acknowledgements / copyright / dedication / about the author, or a
TOC-shaped body (≥ 8 lines, ≥ 50 % ending in a page number), are `front`; index / glossary / bibliography /
references / answers are `back`; a short untitled opening before the first real section is `front`. Only `body`
segments are analysed into units and scheduled into chunks; the Materials tab lists what was not scheduled.

### 7.3 Key terms
Tokens `[A-Za-z][A-Za-z\-]{3,}`; lowercase for counting; ignore a 200-word stopword list;
score = freq × (1.6 if the term appears Capitalised mid-sentence) × (1.3 if length ≥ 8);
also collect 2–3-word Capitalised phrases (not sentence-initial). Return top n by score.

### 7.4 Offline analysis (`analyzeOffline`)
- title: `hint` || first heading || first source name without extension.
- subjectCode: from a small keyword→code map (probability/statistics→STAT, calculus/algebra→MATH,
  physics→PHYS, chemistry→CHEM, biology/cell→BIOL, medicine/clinical→MED, history→HIST,
  economics→ECON, computer/algorithm/program→CS, law→LAW, philosophy→PHIL, language/grammar→LING,
  psychology→PSYC, engineering→ENGR, business/marketing→BUS) else the first 4 letters of the title.
- level/difficulty: avg sentence length & avg word length & share of long words → 1..5.
- units: group segments into 4–10 units of roughly equal words (contiguous); unit title = first
  segment title of the group (or `Unit n: <first two key terms>`); topics = top 5 key terms of the
  unit's text; objectives = 3 lines built from templates with the topics ("Explain …", "Apply …",
  "Compare …"); relativeSize = 1..5 by words.
- description: two sentences naming the first three unit titles.
Validation/repair (used for LLM output too): units sorted, ranges clamped, gaps filled by
extending the previous unit, overlaps trimmed, empty units removed; at least 1 unit.

---

## 8. Registrar rules (deterministic; the same input always yields the same prospectus)

### 8.1 Hours
`readHours = words / 9000` (150 wpm). `diffMult = [0.85, 0.95, 1.05, 1.2, 1.4][difficulty-1]`.
`totalHours = max(6, segments × 2.5, readHours × 3.5 × diffMult)` (read, notes, practice, review).

### 8.2 Budget and length
`available = settings.weeklyHours − Σ hoursPerWeek of courses in state enrolled that are upcoming or running`.
If `available < 3` → throw `RegistrarError { code:'budget', available, nextFree: date the earliest
running course ends }`. Three pacings (`PACES`) defined by daily effort: condensed 120 min/day Mon–Sat (12 h/week); standard 60 min/day Mon–Fri (5 h); extended 30 min/day Mon–Fri (2.5 h). `weeks = clamp(ceil(totalHours / hoursPerWeek), 2, 52)` — no 16-week cap. If a pace exceeds the free budget it is reduced to fit (`plan.reduced = true`, fewer minutes/day, longer term); the registrar refuses only when fewer than 2.5 h/week are free. `hoursFor = max(6, min(segments × 2.5, 40), readHours × 3.5 × diffMult)`.
`hoursPerWeek = max(3, ceil(totalHours / weeks × 2) / 2)`. `credits = hpw ≥ 9 ? 4 : hpw ≥ 6 ? 3 : hpw ≥ 4 ? 2 : 1`.
`term.start = L.date.nextMonday()`; `term.end = start + weeks×7 − 1` (Sunday).

### 8.3 Daily study blocks
One `Session` per study day (`kind:'Study block'`) at the course's slot hour — candidates 09:00, 11:00, 14:00, 16:00, 18:00, 07:00, 20:00; the first hour at which no concurrent course has a block overlapping on any shared day wins (`minutesPerDay = hoursPerWeek × 60 / studyDays`). Final week: blocks only on days before the final; midterm week: no block on the exam day.
Each block holds 2–5 chunks: the week's reading split into bite-sized `read` chunks (at a segment's sub-headings, else at paragraph boundaries so none exceeds `clamp(round(minutesPerDay/3), 12, 25)` min; `minutes = clamp(round(words/70), 5, 60)`), spread across the week's days by count; up to two `review` chunks by **spaced repetition** — yesterday's reading (6 min) and the oldest reading due at the expanding intervals 3 / 7 / 21 study days (8 min), each carrying the reviewed `segment/from/to/pages` and `ago` so it opens the pages it reviews; a `practise` chunk (`clamp(round(minutesPerDay × 0.3), 10, 25)` min) on the day's focus, or on the coming exam in midterm/final weeks. Reading chunks carry `pages` via `locate()` when the source is a PDF.

### 8.4 Weeks
Capacity per week: 1.0 teaching; 0.5 midterm week; 0.35 final week. `midterm week = ceil(weeks/2)`
only if `weeks ≥ 5`; final week = last. Total capacity C = Σ. Each unit gets
`share = relativeSize / Σ relativeSize × C`. Walk weeks in order pouring units in sequence;
a unit may span weeks (`fraction` recorded, label `Unit k · Part 2 of 3`); a week's `segments`
are the segment indices of the units it holds (proportional slice when split; never empty). Week
title = the unit title(s) it holds (joined with " · " for ≤ 2, "… and n more" otherwise);
final week title = "Review and final examination"; midterm week title prefixed "Midterm week · ".

### 8.5 Assessments (all times local; ISO strings)
- **quiz**: every teaching and midterm week except the final week. Opens Friday 08:00 of the week,
  due Sunday 23:59, `closesAt = dueAt`, `durationMin = 15`, `lateAllowed = false`,
  covers `[week]`. Title `Quiz n`. Mix: 6 mcq (2 pts) + 2 short (5 pts).
- **pset**: every even-numbered week that is not the final week (and weeks ≥ 2). Opens Monday
  08:00, due Sunday 23:59, `closesAt = dueAt + 3 days`, untimed, `lateAllowed = true`,
  covers `[week−1, week]`. Title `Problem set n`. Mix: 4 problem (10 pts).
- **midterm**: if `weeks ≥ 5`, on the midterm week: a Wednesday, window 09:00–21:00 (`opensAt`/`dueAt`), `closesAt = dueAt`,
  `durationMin = 75`, covers weeks `1..mid`. Clash rule: if another enrolled course has an exam
  (midterm/final) on that date, try Thursday, then Tuesday. Mix: 10 mcq (2) + 4 short (5) + 2 problem (10).
- **final**: last week Friday, window 09:00–21:00, `durationMin = 120`, covers all weeks (weight
  the second half). Clash: Thursday, then Wednesday. Mix: 14 mcq (2) + 6 short (5) + 3 problem (10) + 1 essay (15).
- **project**: if `weeks ≥ 8`: brief opens Monday 08:00 of week 3, due Friday 23:59 of week
  `weeks−1`, `closesAt = dueAt + 3 days`, `lateAllowed = true`, untimed, single `essay` question
  (100 pts) whose prompt is the brief; the paper carries `brief` markdown (LLM or offline template
  naming three units and four deliverables + rubric).
- Weights: `weeks < 5` → quiz 20, pset 30, final 45, participation 5. `5 ≤ weeks < 8` → quiz 15,
  pset 25, midterm 20, final 35, participation 5. `weeks ≥ 8` → quiz 10, pset 20, midterm 20,
  project 15, final 30, participation 5. Drop a category with zero items and give its weight to
  `final`.
- `policy.withdrawBefore = start + floor(weeks × 7 × 0.6) days`.
- Course code: `subjectCode + ' ' + level number + sequence`: level 1xx introductory, 2xx
  intermediate, 3xx advanced; sequence = 1 + count of existing courses with the same
  subjectCode (so `PROB 201`, then `PROB 202`). `hue` = one of `[160, 220, 15, 275, 45, 195, 330, 95]`
  least used among existing courses.

### 8.6 Standing
For each category with items: `avg` = mean `grade.pct` over items with a grade (missed = 0
counts); `contrib = weight × avg / 100`. Participation: over chunks that have fallen due (days before today, plus today's completed ones): on-time = 1, late = ½, undone = 0. `current = Σ contrib / Σ weight of categories that have ≥ 1 graded item or held
session × 100` (null if none). `projected` = same but ungraded future items assumed at the
current average (null if none graded). Letter scale: A ≥ 93, A− ≥ 90, B+ ≥ 87, B ≥ 83, B− ≥ 80,
C+ ≥ 77, C ≥ 73, C− ≥ 70, D+ ≥ 67, D ≥ 63, D− ≥ 60, else F. Points: A 4.0, A− 3.7, B+ 3.3, B 3.0,
B− 2.7, C+ 2.3, C 2.0, C− 1.7, D+ 1.3, D 1.0, D− 0.7, F 0. GPA = Σ points × credits / Σ credits
over completed (not withdrawn) courses.

### 8.7 Lifecycle and sweep
State of an assessment (`assessmentState`), evaluated at `L.now()`:
- `grade` present → `graded` (missed ones have `grade.missed = true` → `missed`)
- `attempt.startedAt && !submittedAt` → `in_progress`
- `now < opensAt` → `upcoming`
- `now < dueAt` → `open`
- `now < closesAt && lateAllowed` → `late`
- else → `missed` (sweep materialises the zero grade)
`deadline(course, a)` for an in-progress timed attempt = `min(startedAt + durationMin, closesAt)`;
untimed = `closesAt`. `begin` refuses unless state is `open|late` (throws a readable Error) and
requires the honour pledge (view-side). `submit` grades: mcq locally; the rest via
`faculty.grade`; `rawPct = points / max × 100`; if `submittedAt > dueAt` and `lateAllowed`:
`days = ceil((submittedAt − dueAt) / 86400000)`, `penaltyPct = min(days × perDayPct, maxDays × perDayPct)`,
`pct = rawPct × (1 − penaltyPct/100)`; letter via scale. Ledger `assessment_submitted` then
`assessment_graded`. `sweep()`: for every enrolled course — in-progress attempts past their
deadline → `submit({ auto:true })`; unattempted assessments past `closesAt` → zero grade
(`missed:true`, results empty, ledger `assessment_missed`); courses past `term.end` with no
`final` → compute `standing` with every ungraded item at 0, write `course.final`, ledger
`course_completed`. Sweep is idempotent and safe to call every 20 s and on every render.

---

## 9. Sample material

`src/sample.js` defines `L.SAMPLE = { name, text }` — a ~1,500-word introduction to probability
with `##` headings. "Load the sample course" on the empty Today page runs the normal enrolment
pipeline on it (so the sample gets a real, binding schedule too) and toasts that it is sample
material.

---

## 10. Smoke test (`tools/smoke.js`)

Headless Chrome via `playwright-core` (`channel: 'chrome'`). It opens `dist/lyceum.html?debug=1`,
fails on any console error or uncaught exception, and walks the scenario described in the file
(matriculate → sample course offline → prospectus invariants → enrol → attend → fast-forward with
the registrar clock → begin/answer/submit a quiz → miss a quiz → withdraw refusal after 60 % →
transcript + ledger verify → export/import round trip → dark theme render). It writes screenshots
to `shots/`. Extend it with more assertions whenever you find a bug; never delete an assertion.

### 9.1 Official papers (`src/papers.js`)
`L.papers.contractSheet(prospectus, student, { forSigning })` renders the registration contract; `mountPad(root)`
wires `#signature-pad`; `L.registrar.enrol(prospectus, { no, name, signature })` requires a typed name equal to the
record name and a drawn signature, stores `course.contract`, ledger `contract_signed` then `enrolled`.
`issueCertificate(course)` runs from `sweep()` on completion at ≥ `PASS` (70 %); `certificateSvg(course)` is the one
source for display, print and `certificatePng()` export. Routes `#/contract/:id`, `#/certificate/:id`, `#/stats`.

### 8.8 Quick check (honest streaks)
A `read` chunk cannot be ticked directly: `complete()` returns `'needs_check'` until `submitCheck()` has passed. `checkPaper()` sets two mcq from the chunk's own text (faculty `check` mix, offline otherwise) and caches them on `chunk.check`; `submitCheck(answers)` logs `chunk_checked { right, of, attempt, passed }`, and on a pass marks `chunk.checked` and completes the chunk (late rules unchanged). Retries are unlimited and all logged.

### 9.2 Native bridge (`src/native.js`)
`L.native` wraps Capacitor when present (no-ops on the web): the record is mirrored to `Documents/lyceum/record.json` and restored at boot if newer; materials/originals are mirrored as files; local notifications are re-planned from the schedule on every save (study block, paper opens, due −3 h, exam morning; ≤ 60 pending); haptics on ticks; native share for the certificate PNG.

### 9.3 Purchases (`src/store.js`)
`L.store` sells one consumable product, `com.lyceum.app.course`, through `@capgo/native-purchases` inside the
native apps. `required()` is true only when a server is configured, it issues entitlements (`/health.entitlements`)
and is not running the free pilot (`/health.free`) — or when a developer secret is set (debug settings) to exercise
the path on the web against a test server. The contract step shows the store's own price (`price()` →
`priceString`, never hard-coded) and the button reads “Sign and pay …”; `buy(prospectus)` runs after the signature
is valid and before the record is written: store sheet → receipt (Apple JWS / Play purchase token) →
`POST /v1/iap/verify` → `{ token }` → `enrol(p, contract, entitlement)` stores `course.entitlement =
{ token, tx, platform, productId, courseHash, sandbox, at }`, `course.contract.fee` and the ledger `enrolled` entry
carries `fee` + `purchase`. A receipt the server could not confirm is kept in `S.pendingPurchases` and settled on the
next attempt for any course (the server has never seen it), so a student is never charged twice. `S.device` is a
random id every entitlement is bound to. The web build charges nothing.

### 9.4 Cohorts and instructors (`src/cohort.js`, `server/cohorts.js`)
An **instructor** is an account on the server (`node admin.js add "Name"` prints a key once); the key is entered under
More → Instructor and kept in `S.instructor` (never exported). Instructor mode in the wizard (`#/enrol?teach=1`)
runs the registrar with `teach: true` (no personal budget or timetable, first slot 09:00) and a chosen `start`
Monday; the prospectus is **published** (`POST /v1/instructor/cohorts`: the plan without its text + the material
pack; originals `PUT /v1/cohorts/:code/file/:sourceId`) and the server answers with a six-character code. A
**student** joins by code (`#/enrol?join=CODE` or the Join card): the plan comes back as a Prospectus with
`cohort: { code, title, instructor, members }`, must pass `registrar.fits()` (budget and no timetable clash with
running courses), skips the pace step and the store fee, and is signed like any contract; `enrol` then `POST
…/join` puts the student on the roster and returns a cohort entitlement (faculty for the term). Joining closes at the
start of term. Progress (`chunksDone/Total`, current letter, streak, week, papers) is posted on ticks (debounced) and
sweeps (≤ every 10 min) to `…/progress`; the roster shows on the course's **Class** tab and on the instructor's
Teaching page (`#/teach`), which can close or reopen enrolment. The term, days and papers of a cohort are the
instructor's and identical for everyone; nobody, including the instructor, can change them after publishing.

### 10.1 Test hooks (binding — the smoke test uses exactly these)
- welcome: `<input id="student-name">`, button `[data-act=matriculate]`.
- today: `.empty` when there are no courses (with `[data-act=load-sample]`), `.today-grid` otherwise.
  `load-sample` navigates to `#/enrol?sample=1`; the wizard preloads `L.SAMPLE` as a source and
  submits to the registrar automatically, landing on the prospectus.
- enrol: while a prospectus is displayed, `window.__prospectus` holds the Prospectus object
  (debug aid, harmless); `[data-act=enrol-confirm]` opens the contract step: `.sheet.contract`, `<canvas id="signature-pad">`,
  `<input id="contract-name">`, `[data-act=sign-enrol]` (labelled “Sign and pay <price>” when `L.store.required()`);
  a failed purchase or enrolment renders `#contract-error` in place without re-rendering (the signature stays);
  `[data-act=enrol-discard]` abandons.
- modals: `L.ui.confirm` renders `.modal` with `[data-act=modal-ok]` and `[data-act=modal-cancel]`.
- course page: `.syllabus` present on the syllabus tab.
- assess: before-state has `<input type="checkbox" id="pledge">` and `[data-act=begin]` (disabled
  until the pledge is ticked and the state is open/late). Exam room root has class `.exam`;
  mcq options are `<input type="radio" data-in="answer" data-qid="…" value="0..3">`; short /
  problem / essay answers are `<textarea data-in="answer" data-qid="…">`; `[data-act=submit-paper]`
  → `L.ui.confirm` → result root `.result`.
- core: `L.exportRecord() → Promise<{ version, exportedAt, state, materials }>` and
  `L.importRecord(obj) → Promise<void>` (replaces state + materials, ledger `data_imported`
  appended after import, then `L.render()`). Settings uses both.
- `Prospectus` shape = a Course minus `id/createdAt/state` plus `{ sourcesText: string }` (the
  normalised material, stored to IndexedDB by `enrol`); `enrol` assigns `id`, `hue`, `createdAt`.
