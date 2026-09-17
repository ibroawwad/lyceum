(function (L) {
  'use strict';

  const MODELS = [
    'anthropic/claude-fable-5.1',
    'anthropic/claude-opus-5',
    'anthropic/claude-sonnet-5',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'google/gemma-4-31b-it:free',
  ];
  const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

  class FacultyError extends Error {
    constructor(reason, tried = []) { super(reason); this.name = 'FacultyError'; this.reason = reason; this.tried = tried; }
  }

  const available = () => !!(L.S?.settings?.apiKey || '').trim();
  const chain = () => {
    const first = (L.S?.settings?.model || '').trim();
    return [first, ...MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
  };

  // Pull the last balanced JSON value out of a reply that may carry prose or fences around it.
  function extractJson(text) {
    if (!text) return null;
    let t = String(text);
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/gi);
    if (fence) {
      for (const f of fence.reverse()) {
        const inner = f.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
        try { return JSON.parse(inner); } catch (e) { /* keep looking */ }
      }
    }
    for (let end = t.length - 1; end >= 0; end--) {
      const c = t[end];
      if (c !== '}' && c !== ']') continue;
      const open = c === '}' ? '{' : '[';
      let depth = 0, inStr = false, esc = false;
      for (let i = end; i >= 0; i--) {
        const ch = t[i];
        if (inStr) {
          if (ch === '"') { let k = i - 1, bs = 0; while (k >= 0 && t[k] === '\\') { bs++; k--; } if (bs % 2 === 0) inStr = false; }
          continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === c) depth++;
        else if (ch === open) { depth--; if (depth === 0) { try { return JSON.parse(t.slice(i, end + 1)); } catch (e) { break; } } }
      }
    }
    return null;
  }

  async function call({ task = 'task', system, user, maxTokens = 6000, json = true, temperature = 0.3, onModel } = {}) {
    const key = (L.S?.settings?.apiKey || '').trim();
    if (!key) throw new FacultyError('No OpenRouter key is set. Add one in Settings, or continue with the offline examiner.');
    const tried = [];
    for (const model of chain()) {
      if (onModel) onModel(model);
      const t0 = Date.now();
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 90000);
      try {
        const r = await fetch(ENDPOINT, {
          method: 'POST',
          signal: ctl.signal,
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://lyceum.local', 'X-Title': 'Lyceum' },
          body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: maxTokens, temperature }),
        });
        if (r.status === 401) throw new FacultyError('Your OpenRouter key was rejected (401). Check it in Settings.', tried);
        const body = await r.json().catch(() => ({}));
        if (!r.ok || body.error) {
          const msg = body?.error?.message || ('HTTP ' + r.status);
          tried.push({ model, status: body?.error?.code || r.status, message: msg });
          console.info(`Lyceum faculty: ${model} → ${msg}`);
          continue;
        }
        const content = body?.choices?.[0]?.message?.content || '';
        if (!content.trim()) { tried.push({ model, status: 'empty', message: 'empty reply' }); continue; }
        if (json) {
          const data = extractJson(content);
          if (data == null) { tried.push({ model, status: 'parse', message: 'no JSON in reply' }); console.info(`Lyceum faculty: ${model} → unparseable reply for ${task}`); continue; }
          return { data, text: content, model, ms: Date.now() - t0 };
        }
        return { text: content, model, ms: Date.now() - t0 };
      } catch (e) {
        if (e instanceof FacultyError) throw e;
        tried.push({ model, status: e.name === 'AbortError' ? 'timeout' : 'network', message: e.message });
        console.info(`Lyceum faculty: ${model} → ${e.message}`);
      } finally { clearTimeout(timer); }
    }
    const summary = tried.map((t) => `${t.status} on ${t.model}`).join('; ');
    throw new FacultyError(`Faculty unavailable (${summary}).`, tried);
  }

  async function test() {
    const t0 = Date.now();
    try {
      const r = await call({ task: 'test', system: 'Reply with strict JSON only.', user: 'Reply with the JSON {"ok":true} and nothing else.', maxTokens: 20, json: true });
      return { ok: !!(r.data && r.data.ok), model: r.model, ms: Date.now() - t0 };
    } catch (e) { return { ok: false, error: e.message, ms: Date.now() - t0 }; }
  }

  // ---------- helpers shared by online and offline paths ----------
  const MIX = {
    quiz: [['mcq', 6, 2], ['short', 2, 5]],
    pset: [['problem', 4, 10]],
    midterm: [['mcq', 10, 2], ['short', 4, 5], ['problem', 2, 10]],
    final: [['mcq', 14, 2], ['short', 6, 5], ['problem', 3, 10], ['essay', 1, 15]],
    project: [['essay', 1, 100]],
  };
  function sampleText(text, limit) {
    text = String(text || '');
    if (text.length <= limit) return text;
    // take evenly spaced windows so every covered part is represented
    const n = Math.max(3, Math.floor(limit / 4000));
    const win = Math.floor(limit / n);
    const step = Math.floor((text.length - win) / (n - 1));
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(text.slice(i * step, i * step + win));
    return parts.join('\n\n[…]\n\n');
  }
  // line breaks are boundaries too, so headings never glue onto the sentence after them
  const sentencesOf = (text) => String(text || '').split(/\n+/).flatMap((ln) => ln.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z(])/)).map((s) => s.trim()).filter((s) => s && /[.!?]$/.test(s));

  // deterministic PRNG so an offline paper regenerates identically for the same assessment
  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = (h >>> 0) || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const shuffle = (arr, rnd) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  async function seal(questions) { return L.sha256(JSON.stringify(questions)); }
  async function finishPaper(questions, { source, model, note, brief }) {
    questions = questions.map((q, i) => Object.assign({}, q, { id: 'q' + (i + 1) }));
    return { id: L.uid('p'), generatedAt: new Date(L.now()).toISOString(), source, model, note, seal: await seal(questions), questions, brief };
  }

  // ---------- offline examiner ----------
  const offline = {
    async analyze({ segments, text, hint, sourceName }) {
      return { analysis: L.intake.analyzeOffline({ text, segments, hint, sourceName }), source: 'offline' };
    },

    async composePaper({ course, assessment, text }) {
      const rnd = seeded(assessment.id + '|' + (course.id || course.code || ''));
      const terms = L.intake.keyTerms(text, 60).filter((t) => t.length >= 4 && t.length <= 28);
      // sentences that stand on their own: drop leading connectors ("Third, …", "However, …") and anything that reads like a list item
      const sents = sentencesOf(text).map((s) => s.replace(/^(?:first|second|third|fourth|finally|however|also|thus|hence|therefore|in words|for example|that is|note that)[,:]?\s+/i, (m) => '')).map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .filter((s) => s.length >= 60 && s.length <= 240 && !/[|{}<>]/.test(s) && (s.match(/[=∑∫^]/g) || []).length <= 3 && !/^(?:[A-Z]\d|[a-z]\)|\d+\))/.test(s));
      const contains = (s, t) => new RegExp('(^|[^A-Za-z])' + t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '([^A-Za-z]|$)', 'i').test(s);
      const pool = [];
      for (const s of sents) for (const t of terms) if (contains(s, t)) { pool.push({ s, t }); break; }
      const covered = course.weeks.filter((w) => assessment.coversWeeks.includes(w.n));
      const unitTitles = covered.map((w) => w.title).filter((t, i, a) => a.indexOf(t) === i);
      const used = new Set();
      const pick = (avoidTerm = true) => {
        const order = shuffle(pool, rnd);
        for (const p of order) if (!used.has(p.s) && (!avoidTerm || !usedTerms.has(p.t))) { used.add(p.s); usedTerms.add(p.t); return p; }
        for (const p of order) if (!used.has(p.s)) { used.add(p.s); return p; }
        return order[0] || null;
      };
      const usedTerms = new Set();
      const distractors = (term, n) => {
        const shape = (t) => (/[A-Z]/.test(t.charAt(0)) ? 'cap' : 'low') + (t.includes(' ') ? 'phrase' : 'word');
        let cands = terms.filter((t) => t !== term && Math.abs(t.length - term.length) <= 6 && !term.includes(t) && !t.includes(term) && t.length >= 5 && !/(?:ing|ed|ly)$/.test(t) && shape(t) === shape(term));
        if (cands.length < 3) cands = terms.filter((t) => t !== term && !term.includes(t) && !t.includes(term) && t.length >= 5);
        return shuffle(cands, rnd).slice(0, n);
      };
      const qs = [];
      for (const [type, count, points] of MIX[assessment.kind] || MIX.quiz) {
        for (let k = 0; k < count; k++) {
          if (type === 'mcq') {
            const p = pick();
            if (!p) { qs.push({ type: 'mcq', prompt: `Which of the following terms is central to ${unitTitles[k % unitTitles.length] || course.title}?`, options: shuffle(terms.slice(0, 4), rnd), answer: 0, points }); continue; }
            const ds = distractors(p.t, 3);
            while (ds.length < 3) ds.push(['the sample space', 'a constant', 'an outcome', 'a parameter'][ds.length]);
            const options = shuffle([p.t, ...ds], rnd);
            const blanked = p.s.replace(new RegExp('(^|[^A-Za-z])' + p.t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '([^A-Za-z]|$)', 'i'), '$1______$2');
            qs.push({ type: 'mcq', prompt: 'Fill the blank: ' + blanked, options: options.map(cap), answer: options.indexOf(p.t), points });
          } else if (type === 'short') {
            // short answers ask about the material's most frequent concepts, not whatever sentence came up
            const top = shuffle(terms.slice(0, 20).filter((t) => !usedTerms.has(t)), rnd).sort((a, b) => (b.includes(' ') ? 1 : 0) - (a.includes(' ') ? 1 : 0));
            const term = top[0] || terms[k] || course.title;
            usedTerms.add(term);
            const p = null;
            const model = sents.filter((s) => contains(s, term)).slice(0, 2).join(' ') || (p ? p.s : '');
            qs.push({ type: 'short', prompt: `In your own words, explain «${term}» as it is used in the course material.`, modelAnswer: model, rubric: 'Full marks for a definition that matches the material and one correct consequence or example.', points });
          } else if (type === 'problem') {
            const p1 = pick(), p2 = pick();
            const a = p1 ? p1.t : terms[0] || 'the main idea', b = p2 ? p2.t : terms[1] || 'its application';
            const title = unitTitles[k % unitTitles.length] || course.title;
            const model = sents.filter((s) => contains(s, a) || contains(s, b)).slice(0, 3).join(' ');
            qs.push({ type: 'problem', prompt: `Using the material on «${title}», explain how «${a}» relates to «${b}», and work through one concrete example.`, modelAnswer: model, rubric: 'Definitions correct (3), relationship stated precisely (3), example worked correctly with the right reasoning (4).', points });
          } else if (type === 'essay') {
            if (assessment.kind === 'project') {
              const themes = unitTitles.slice(0, 3);
              const brief = `## ${course.title} — project brief\n\nThemes: ${themes.join('; ')}.\n\n### Deliverables\n1. An analysis of how the themes above connect, grounded in the course material.\n2. Two worked examples of your own design, solved in full.\n3. A comparison table of the key concepts (definition, when it applies, a common mistake).\n4. A short reflection on the limits of the material: what it does not cover and why that matters.\n\n### Rubric (100)\n- Accuracy against the material — 40\n- Depth and originality of the examples — 25\n- Structure and clarity — 20\n- Reflection on limits — 15`;
              qs.push({ type: 'essay', prompt: brief, modelAnswer: sents.slice(0, 6).join(' '), rubric: 'Accuracy 40, examples 25, structure 20, reflection 15.', points, brief });
            } else {
              const themes = unitTitles.slice(0, 3);
              qs.push({ type: 'essay', prompt: `Write a structured answer connecting «${themes.join('», «')}»: state the definitions, show one worked example for each, and explain how they depend on one another.`, modelAnswer: sents.slice(0, 8).join(' '), rubric: 'Definitions (5), one correct example per theme (6), dependencies explained (4).', points });
            }
          }
        }
      }
      const brief = qs.find((q) => q.brief)?.brief;
      qs.forEach((q) => delete q.brief);
      const paper = await finishPaper(qs, { source: 'offline', note: 'Paper set by the offline examiner from the course material.', brief });
      return { paper, source: 'offline', note: paper.note };
    },

    gradeOne(q, answer) {
      const a = String(answer ?? '').trim();
      if (q.type === 'mcq') { const ok = String(answer) === String(q.answer); return { id: q.id, points: ok ? q.points : 0, max: q.points, feedback: ok ? 'Correct.' : `The correct option was ${String.fromCharCode(65 + q.answer)}.` }; }
      if (a.length < 15) return { id: q.id, points: 0, max: q.points, feedback: 'No answer submitted.' };
      const cw = (s) => new Set((String(s).toLowerCase().match(/[a-z][a-z'\-]{3,}/g) || []).filter((w) => !L.intake.STOP.has(w)));
      const M = cw(q.modelAnswer || q.prompt), A = cw(a);
      let hit = 0; const missing = [];
      for (const w of M) { if (A.has(w)) hit++; else missing.push(w); }
      const r = hit / Math.max(1, M.size);
      const pct = Math.min(1, r / 0.5);
      const points = Math.round(pct * q.points * 2) / 2;
      const fb = pct >= 0.99 ? 'Covers the key ideas from the material.' : `Expected ideas not found: ${missing.slice(0, 3).join(', ')}.`;
      return { id: q.id, points, max: q.points, feedback: 'Offline examiner: ' + fb };
    },
    async grade({ paper, answers }) {
      return { results: paper.questions.map((q) => offline.gradeOne(q, answers[q.id])), source: 'offline', note: 'Graded by the offline examiner (keyword agreement with the model answer).' };
    },

    async notes({ course, week, text }) {
      const segs = course.material.segments.filter((s) => week.segments.includes(s.i));
      const terms = L.intake.keyTerms(text, 8);
      let md = `# Week ${week.n}: ${week.title}\n\n## Objectives\n` + week.objectives.map((o) => `- ${o}`).join('\n') + '\n\n## Reading map\n';
      for (const s of segs) {
        const first = sentencesOf(text.slice(0, 20000)).find((x) => x.length > 40) || '';
        md += `- **${s.title}** (${L.fmt.num(s.words)} words). ${first}\n`;
      }
      md += `\n## Terms to know\n` + terms.map((t) => `- ${cap(t)}`).join('\n') + `\n\n## Check yourself\n- Can you state each objective above without the notes?\n- Which term in the list would you find hardest to define? Start there.\n`;
      return { markdown: md, source: 'offline', note: 'Notes compiled offline from the material.' };
    },
  };

  // ---------- online faculty with validation ----------
  const SYS_ANALYZE = 'You are senior faculty at a top-tier research university designing a rigorous course from material a student supplied. You return strict JSON only: no prose, no markdown fences.';
  const SYS_PAPER = 'You set examinations for a top-tier university. Every question must be answerable from the material supplied and must test understanding, not recall of phrasing. Multiple-choice distractors must be plausible. Model answers must be correct and specific. Return strict JSON only.';
  const SYS_GRADE = 'You are a rigorous but fair examiner. Award partial credit against the rubric. Feedback: two sentences, specific to what the student wrote, naming what was right and what was missing. Return strict JSON only.';
  const SYS_NOTES = 'You write lecture notes for a top-tier university course: precise, structured, with worked examples. Markdown only.';

  async function analyze({ segments, text, hint, words, sourceName }) {
    const fallback = () => L.intake.analyzeOffline({ text, segments, hint, sourceName });
    if (!available()) return { analysis: fallback(), source: 'offline', note: 'No faculty key set — the course was analysed offline.' };
    const excerpt = segments.length > 60 ? 220 : 500;
    const list = segments.map((s) => `[${s.i}] "${s.title}" (${s.words} words${(s.role || 'body') !== 'body' ? `, ${s.role} matter — not taught, use for structure only` : ''}) — ${text.slice(s.start, s.start + excerpt).replace(/\s+/g, ' ').trim()}`).join('\n');
    const user = `${hint ? `Working title from the student: ${hint}\n` : ''}Material: ${L.fmt.num(words)} words in ${segments.length} segments.\n\nSegments:\n${list}\n\nDesign the course. Return JSON:\n{"title": string, "subjectCode": 2-4 uppercase letters, "subject": string, "level": "introductory"|"intermediate"|"advanced", "difficulty": 1-5, "description": "two sentences", "prerequisites": [string], "units": [{"title": string, "segments": [from, to], "topics": [3-6 strings], "objectives": [2-4 measurable objectives with Bloom verbs], "relativeSize": 1-5}]}\nUnits must be contiguous, in order, and together cover every segment index from 0 to ${segments.length - 1}. Segments marked front matter or back matter (contents, preface, copyright, index, glossary, bibliography) are NOT study material: never build a unit around them, never list them as topics, and never let them decide a unit's title — they may only sit inside a unit's index range so the ranges stay contiguous.`;
    try {
      const r = await call({ task: 'analyze', system: SYS_ANALYZE, user, maxTokens: 6000 });
      const d = r.data || {};
      const off = fallback();
      const a = {
        title: String(d.title || off.title).trim() || off.title,
        subjectCode: (String(d.subjectCode || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4)) || off.subjectCode,
        subject: String(d.subject || off.subject),
        level: ['introductory', 'intermediate', 'advanced'].includes(d.level) ? d.level : off.level,
        difficulty: L.clamp(Math.round(Number(d.difficulty) || off.difficulty), 1, 5),
        description: String(d.description || off.description),
        prerequisites: Array.isArray(d.prerequisites) ? d.prerequisites.map(String).slice(0, 6) : [],
        units: L.intake.repairUnits(d.units, segments.length),
      };
      if (a.subjectCode.length < 2) a.subjectCode = off.subjectCode;
      a.units.forEach((u, i) => {
        const o = off.units[Math.min(i, off.units.length - 1)];
        if (!u.topics.length) u.topics = o.topics;
        if (!u.objectives.length) u.objectives = o.objectives;
      });
      return { analysis: a, source: 'llm', model: r.model };
    } catch (e) {
      return { analysis: fallback(), source: 'offline', note: `${e.message} The course was analysed by the offline registrar.` };
    }
  }

  async function composePaper({ course, assessment, text, onModel }) {
    if (!available()) return offline.composePaper({ course, assessment, text });
    const mix = MIX[assessment.kind] || MIX.quiz;
    const covered = course.weeks.filter((w) => assessment.coversWeeks.includes(w.n));
    const outline = covered.map((w) => `Week ${w.n}: ${w.title}\n  Objectives: ${w.objectives.join(' | ')}`).join('\n');
    const spec = mix.map(([t, n, p]) => `${n} × "${t}" at ${p} points each`).join(', ');
    const user = `Course: ${course.title} (${course.code}, ${course.level}).\nAssessment: ${assessment.title} (${assessment.kind}).\nCovered:\n${outline}\n\nMaterial excerpt:\n"""\n${sampleText(text, 60000)}\n"""\n\nSet exactly: ${spec}. ${assessment.kind === 'project' ? 'For the project, "prompt" is the full brief in markdown (themes, four deliverables, a rubric that sums to 100) and also return it as "brief".' : ''}\nReturn JSON: {"questions": [{"type": "mcq"|"short"|"problem"|"essay", "prompt": string, "options": [4 strings, mcq only], "answer": 0-3 (mcq only), "modelAnswer": string (non-mcq), "rubric": string (non-mcq), "points": number}]${assessment.kind === 'project' ? ', "brief": markdown' : ''}}\nOrder: all mcq first, then short, then problem, then essay.`;
    try {
      const r = await call({ task: 'paper', system: SYS_PAPER, user, maxTokens: 8000, onModel });
      const raw = Array.isArray(r.data?.questions) ? r.data.questions : [];
      const off = await offline.composePaper({ course, assessment, text });
      const qs = [];
      for (const [type, count, points] of mix) {
        const got = raw.filter((q) => q && q.type === type && String(q.prompt || '').trim()).filter((q) => type !== 'mcq' || (Array.isArray(q.options) && q.options.length === 4 && q.options.every((o) => String(o).trim()) && Number.isInteger(Number(q.answer)) && Number(q.answer) >= 0 && Number(q.answer) <= 3));
        const spare = off.paper.questions.filter((q) => q.type === type);
        for (let k = 0; k < count; k++) {
          const q = got[k];
          if (q) qs.push({ type, prompt: String(q.prompt).trim(), options: type === 'mcq' ? q.options.map((o) => String(o).trim()) : undefined, answer: type === 'mcq' ? Number(q.answer) : undefined, modelAnswer: type === 'mcq' ? undefined : String(q.modelAnswer || ''), rubric: type === 'mcq' ? undefined : String(q.rubric || ''), points });
          else if (spare[k]) qs.push(Object.assign({}, spare[k], { id: undefined, points }));
        }
      }
      const clean = qs.map((q) => { const o = {}; for (const k of Object.keys(q)) if (q[k] !== undefined) o[k] = q[k]; return o; });
      const brief = assessment.kind === 'project' ? (String(r.data?.brief || clean[0]?.prompt || off.paper.brief)) : undefined;
      const short = qs.length < mix.reduce((a, [, n]) => a + n, 0);
      const paper = await finishPaper(clean, { source: 'llm', model: r.model, note: short ? 'Some questions were supplied by the offline examiner because the faculty reply was incomplete.' : undefined, brief });
      return { paper, source: 'llm', model: r.model, note: paper.note };
    } catch (e) {
      const off = await offline.composePaper({ course, assessment, text });
      off.note = off.paper.note = `${e.message} Paper set by the offline examiner.`;
      return off;
    }
  }

  async function grade({ course, assessment, paper, answers, onModel }) {
    const results = [];
    const pending = [];
    for (const q of paper.questions) {
      const a = answers[q.id];
      if (q.type === 'mcq') results.push(offline.gradeOne(q, a));
      else if (String(a ?? '').trim().length < 15) results.push({ id: q.id, points: 0, max: q.points, feedback: 'No answer submitted.' });
      else pending.push(q);
    }
    if (!pending.length) return { results: order(paper, results), source: 'local' };
    if (!available()) {
      pending.forEach((q) => results.push(offline.gradeOne(q, answers[q.id])));
      return { results: order(paper, results), source: 'offline', note: 'Graded by the offline examiner (keyword agreement with the model answer).' };
    }
    const items = pending.map((q) => ({ id: q.id, question: q.prompt, modelAnswer: q.modelAnswer, rubric: q.rubric, maxPoints: q.points, studentAnswer: String(answers[q.id]) }));
    const user = `Course: ${course.title}. Assessment: ${assessment.title}.\nGrade each item against its rubric and model answer. Points may be fractional (multiples of 0.5).\nItems:\n${JSON.stringify(items, null, 1)}\n\nReturn JSON: {"results": [{"id": string, "points": number, "feedback": string}]}`;
    try {
      const r = await call({ task: 'grade', system: SYS_GRADE, user, maxTokens: 4000, temperature: 0.1, onModel });
      const got = Array.isArray(r.data?.results) ? r.data.results : [];
      for (const q of pending) {
        const g = got.find((x) => x && x.id === q.id);
        if (g && Number.isFinite(Number(g.points))) results.push({ id: q.id, points: Math.round(L.clamp(Number(g.points), 0, q.points) * 2) / 2, max: q.points, feedback: String(g.feedback || '').trim() || 'Graded.' });
        else results.push(offline.gradeOne(q, answers[q.id]));
      }
      return { results: order(paper, results), source: 'llm', model: r.model };
    } catch (e) {
      pending.forEach((q) => results.push(offline.gradeOne(q, answers[q.id])));
      return { results: order(paper, results), source: 'offline', note: `${e.message} Graded by the offline examiner.` };
    }
  }
  const order = (paper, results) => paper.questions.map((q) => results.find((r) => r.id === q.id));

  async function notes({ course, week, text, onModel }) {
    if (!available()) return offline.notes({ course, week, text });
    const user = `Course: ${course.title} (${course.level}). Week ${week.n}: ${week.title}.\nObjectives:\n${week.objectives.map((o) => '- ' + o).join('\n')}\n\nMaterial:\n"""\n${sampleText(text, 40000)}\n"""\n\nWrite lecture notes for this week in markdown: a short orientation, one section per main idea with a worked example, common mistakes, and a "Check yourself" list of five questions. Stay strictly within the material.`;
    try {
      const r = await call({ task: 'notes', system: SYS_NOTES, user, maxTokens: 5000, json: false, onModel });
      if (!r.text || r.text.trim().length < 200) throw new FacultyError('The faculty reply was empty.');
      return { markdown: r.text.replace(/^```(?:markdown|md)?\s*|```\s*$/g, ''), source: 'llm', model: r.model };
    } catch (e) {
      const off = await offline.notes({ course, week, text });
      off.note = `${e.message} ${off.note}`;
      return off;
    }
  }

  L.faculty = { MODELS, FacultyError, available, chain, call, test, extractJson, analyze, composePaper, grade, notes, offline, MIX };
})(window.L);
