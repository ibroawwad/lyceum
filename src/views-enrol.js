(function (L) {
  'use strict';

  const R = () => L.registrar;
  const esc = L.esc;
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  // wizard state lives only for the session; nothing is written until Enrol
  const W = { sources: [], hint: '', step: 1, plans: null, prospectus: null, error: null, log: [], busy: false, sampleLoaded: false, teach: false, start: '', cohort: null, published: null };
  const reset = () => { Object.assign(W, { sources: [], hint: '', step: 1, plans: null, prospectus: null, error: null, log: [], busy: false, sampleLoaded: false, teach: false, start: '', cohort: null, published: null, fee: null, paid: null }); };
  const totalWords = () => L.sum(W.sources.map((s) => s.words));

  function steps() {
    const st = W.cohort ? [['Cohort', 1], ['Prospectus', 3], ['Contract', 4]] : W.teach ? [['Material', 1], ['Pace', 2], ['Prospectus', 3], ['Publish', 4]] : [['Material', 1], ['Pace', 2], ['Prospectus', 3], ['Contract', 4]];
    return `<div class="wizard-steps">${st.map(([n, i]) => `<div class="wizard-step${W.step === i ? ' is-active' : W.step > i ? ' is-done' : ''}"><span class="n">${i}</span>${n}</div>`).join('')}</div>`;
  }
  function materialStep() {
    const b = R().budget();
    return `${W.teach ? '' : `<div class="card mb-3"><div class="card-head"><h2>Join a cohort</h2><span class="small muted">a code from your instructor</span></div><div class="card-body"><div class="cols"><input id="join-code" class="input mono" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="7" placeholder="ABC123" style="flex:1;max-width:200px;letter-spacing:0.12em" value="${esc(W.joinCode || '')}" data-in="join-code"><button class="btn" data-act="join-cohort"${W.busy ? ' disabled' : ''}>Join</button><a class="btn btn-quiet" href="#/library">Browse the Library</a></div>${W.joinError ? `<div class="notice mt-2" data-kind="bad"><span>${esc(W.joinError)}</span></div>` : '<span class="hint">Everyone in a cohort studies the same term on the same days and sits the same papers.</span>'}</div></div>`}<div class="grid-2">
      <div class="stack gap-2">
        <div class="drop" id="drop"><div><b>PDF, Word, Markdown, text or HTML.</b></div><div class="small mt-1">Several files become one course.</div><label class="btn btn-primary">Choose files<input type="file" id="file-input" multiple accept=".pdf,.docx,.txt,.md,.markdown,.html,.htm,application/pdf,text/plain,text/markdown,text/html"></label></div>
        <div class="field"><label for="paste">Or paste text</label><textarea id="paste" class="textarea" placeholder="Paste lecture notes, a chapter, a syllabus…"></textarea><div class="cols"><button class="btn btn-sm" data-act="add-text">Add text</button></div></div>
        <div class="field"><label for="url">Or fetch a web page</label><div class="cols"><input id="url" class="input" type="url" placeholder="https://…" style="flex:1"><button class="btn btn-sm" data-act="add-url">Fetch</button></div><span class="hint">Some sites block fetching; save the page as PDF if that happens.</span></div>
      </div>
      <div class="stack gap-2">
        <div class="card"><div class="card-head"><h2>Sources</h2><span class="small muted num">${W.sources.length ? `${L.fmt.num(totalWords())} words` : 'none yet'}</span></div><div class="card-body">
          ${W.sources.length ? `<div class="sources">${W.sources.map((s) => `<div class="source-row"><span class="pill">${esc(s.kind)}</span><span class="truncate" title="${esc(s.name)}">${esc(s.name)}</span><span class="num small muted">${L.fmt.num(s.words)} w${s.pages ? ` · ${s.pages} pp` : ''}</span><button class="btn btn-quiet btn-sm" data-act="remove-source" data-id="${s.id}">Remove</button></div>`).join('')}</div>` : '<p class="small muted">Add at least one source.</p>'}
          <div class="field mt-3"><label for="hint">Course title <span class="muted" style="font-weight:400">(optional)</span></label><input id="hint" class="input" value="${esc(W.hint)}" data-in="hint" placeholder="Leave blank and the faculty will name it"></div>
        </div></div>
        ${W.teach ? `<div class="panel small"><b>Instructor mode.</b> The plan you publish is the class's plan: every student who joins gets the same term, days and papers.</div>` : `<div class="panel small"><b>Budget:</b> ${b.available} of ${b.weekly} h/week free${b.committed ? ` (${b.committed} h committed)` : ''}.</div>`}
        ${W.error ? `<div class="notice" data-kind="bad"><span>${esc(W.error)}</span></div>` : ''}
        <div class="cols"><button class="btn btn-primary" data-act="submit-registrar"${W.sources.length && !W.busy ? '' : ' disabled'}>Plan the course</button>${W.sources.length ? `<button class="btn btn-quiet" data-act="clear-sources">Clear</button>` : ''}</div>
      </div></div>`;
  }
  function prospectus(p) {
    const slot = p.plan.slot;
    const days = p.plan.studyDays.length === 7 ? 'every day' : p.plan.studyDays.length === 6 ? 'Mon–Sat' : 'Mon–Fri';
    const weightRows = Object.entries(p.policy.weights).map(([k, w]) => `<div class="tile"><div class="tile-n" style="font-size:22px">${w}%</div><div class="tile-l">${k === 'participation' ? 'Daily chunks' : esc(R().KIND_TITLE[k] + (p.assessments.filter((a) => a.kind === k).length > 1 ? 's' : ''))}</div></div>`).join('');
    const co = p.cohort;
    return `<div class="prospectus" style="--ch:${L.cc(p)}">
      ${co ? `<div class="notice" data-kind="info"><span><b>Cohort ${esc(co.code)}</b> · taught by ${esc(co.instructor)} · ${co.members} enrolled so far. The term, the days and the papers are the instructor's; they are the same for everyone in the class.</span></div>` : W.teach ? `<div class="notice" data-kind="info"><span><b>This is the plan your class will follow.</b> Publishing fixes it; you then share the code.</span></div>` : ''}
      <div class="prospectus-head"><div><div class="course-lockup"><span class="icon-sq">${esc(p.subjectCode.slice(0, 2))}</span><div><span class="code">${esc(p.code)}</span><div class="small muted">${esc(p.subject)} · ${esc(p.level)} · ${p.credits} credit${p.credits === 1 ? '' : 's'}</div></div></div><h2>${esc(p.title)}</h2><p class="lede mt-1">${esc(p.description)}</p></div></div>
      <div class="prospectus-body">
        <dl class="kv"><dt>Term</dt><dd class="mono">${L.fmt.date(p.term.start)} – ${L.fmt.date(p.term.end)} · ${p.term.weeks} weeks</dd><dt>Pace</dt><dd>${esc(p.plan.paceLabel)} · <b>${p.plan.minutesPerDay} min</b> ${days} at ${hm(slot.start)}</dd><dt>Material</dt><dd>${p.material.sources.length} source${p.material.sources.length === 1 ? '' : 's'} · ${L.fmt.num(p.material.words)} words</dd><dt>Faculty</dt><dd>${p.analysis.source === 'llm' ? esc(p.analysis.model) : 'offline registrar'}</dd>${(() => { const a = (p.material.sources.find((x) => x.attribution) || {}).attribution; return a ? `<dt>Material</dt><dd>${esc(a.title)}${a.author ? `, ${esc(a.author)}` : ''} · ${esc(a.license)}</dd>` : ''; })()}<dt>Withdraw by</dt><dd class="mono">${L.fmt.date(L.date.addDays(L.date.parse(p.policy.withdrawBefore), -1))}</dd></dl>
        <div><span class="label">Weights</span><div class="weights mt-1">${weightRows}</div></div>
        <details><summary>Week by week (${p.weeks.length})</summary><div class="syllabus mt-2">${p.weeks.map((w) => `<div class="week-row"><div class="wk">Week<b>${w.n}</b></div><div><div class="topic">${esc(w.title)}</div><div class="parts">${L.fmt.date(w.start)} · ${w.parts.map((x) => esc(x.label)).join(' · ')}</div></div></div>`).join('')}</div></details>
        <details><summary>Assessments (${p.assessments.length})</summary><div class="table-wrap mt-2"><table class="table"><thead><tr><th>Assessment</th><th>Opens</th><th>Due</th><th class="num">Weight</th></tr></thead><tbody>${p.assessments.map((a) => { const n = p.assessments.filter((x) => x.kind === a.kind).length; return `<tr><td>${esc(a.title)}<div class="small muted">${a.durationMin ? L.fmt.dur(a.durationMin) : 'untimed'}${a.lateAllowed ? ' · late window' : ''}</div></td><td class="mono small nowrap">${L.fmt.dt(a.opensAt)}</td><td class="mono small nowrap">${L.fmt.dt(a.dueAt)}</td><td class="num">${((p.policy.weights[a.kind] || 0) / n).toFixed(1)}%</td></tr>`; }).join('')}</tbody></table></div></details>
        <div class="registrar-note"><span class="label">Binding.</span>Dates, weights and exams cannot be changed after you enrol. A paper not submitted by its close is a zero. Lyceum is an independent study tool, not an accredited institution; certificates confer no academic credit.</div>
        <div class="cols">${W.teach ? `<button class="btn btn-primary" data-act="publish-cohort"${W.busy ? ' disabled' : ''}>Publish as a cohort</button>` : `<button class="btn btn-primary" data-act="enrol-confirm">Enrol</button>`}${co ? '' : `<button class="btn btn-quiet" data-act="enrol-paces">Back</button>`}<button class="btn btn-quiet" data-act="enrol-discard">Discard</button></div>
      </div></div>`;
  }
  function paceCards() {
    const keys = ['condensed', 'standard', 'extended'];
    return `<div class="paces">${keys.map((k) => { const p = W.plans[k]; const meta = R().PACES[k];
      if (p.unavailable) return `<div class="pace-card is-unavailable"><span class="label">${esc(meta.label)}</span><div class="pace-n">—</div><p class="small muted">${esc(p.unavailable)}</p></div>`;
      const exams = p.assessments.filter((a) => a.kind === 'midterm' || a.kind === 'final').length;
      const days = p.plan.studyDays.length === 7 ? 'every day' : p.plan.studyDays.length === 6 ? 'Mon–Sat' : 'Mon–Fri';
      return `<div class="pace-card${k === 'standard' ? ' is-default' : ''}"><span class="label">${esc(meta.label)}${k === 'standard' ? ' · recommended' : ''}${p.plan.reduced ? ' · reduced to fit your budget' : ''}</span><div class="pace-n">${p.term.weeks} <span>weeks</span></div><p class="small muted">${esc(meta.blurb)}</p>
        <dl class="kv small"><dt>Daily</dt><dd><b>${p.plan.minutesPerDay} min</b> · ${days}</dd><dt>Weekly</dt><dd>${p.plan.hoursPerWeek} h</dd><dt>Ends</dt><dd class="mono">${L.fmt.date(p.term.end)}</dd><dt>Assessments</dt><dd>${p.assessments.length} · ${exams} exam${exams === 1 ? '' : 's'}${p.assessments.some((a) => a.kind === 'project') ? ' · project' : ''}</dd><dt>Credits</dt><dd>${p.credits}</dd></dl>
        <button class="btn ${k === 'standard' ? 'btn-primary' : ''}" data-act="choose-pace" data-pace="${k}">Choose</button></div>`; }).join('')}</div>
      ${W.teach ? `<div class="field mt-3" style="max-width:280px"><label for="term-start">Term starts (a Monday)</label><input id="term-start" class="input" type="date" value="${esc(W.start || W.plans.standard.term.start)}" min="${esc(W.plans.standard.term.start)}" data-in="term-start"><span class="hint">Changing it redraws the three pacings.</span></div>` : ''}
      <p class="small muted mt-2">Three pacings, no custom plan. ${W.teach ? 'The one you choose is the class’s pace.' : 'The one you choose is fixed at enrolment.'}</p>
      <div class="cols mt-2"><button class="btn btn-quiet" data-act="enrol-back">Back to material</button></div>`;
  }
  function published() {
    const code = W.published;
    return `<div class="card"><div class="card-body stack gap-2">
      <div class="small muted">Cohort code</div><div class="mono" style="font-size:34px;font-weight:600;letter-spacing:0.18em">${esc(code)}</div>
      <p class="small">Students enter this code under <b>Add a course → Join a cohort</b>, or open the link. Enrolment closes when the term begins.</p>
      <div class="cols"><button class="btn btn-primary" data-act="copy-join" data-code="${esc(code)}">Copy link</button><a class="btn" href="#/teach">Your cohorts</a><button class="btn btn-quiet" data-act="enrol-discard">Done</button></div>
    </div></div>`;
  }
  L.views.enrol = {
    title: 'Enrol',
    render(p, q) {
      const body = W.step === 4 && W.teach && W.published ? published() : W.step === 1 ? materialStep()
        : W.step === 2 ? (W.plans ? paceCards() : `<div class="card"><div class="card-body"><div class="log" id="registrar-log">${W.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div>${W.error ? `<div class="notice mt-2" data-kind="bad"><span>${esc(W.error)}</span></div><div class="cols mt-2"><button class="btn" data-act="enrol-back">Back to material</button></div>` : ''}</div></div>`)
        : W.step === 3 && W.prospectus ? prospectus(W.prospectus)
        : W.step === 4 && W.prospectus ? `<div class="sheet-viewport">${L.papers.contractSheet(W.prospectus, L.S.student, { no: W.contractNo, fee: W.fee, forSigning: true })}</div>
            ${W.error ? `<div class="notice mt-2" data-kind="bad"><span>${esc(W.error)}</span></div>` : ''}
            <div class="cols mt-3"><button class="btn btn-primary" data-act="sign-enrol"${W.busy ? ' disabled' : ''}>${W.fee && !W.paid ? `Sign and pay ${esc(W.fee)}` : 'Sign and enrol'}</button><button class="btn btn-quiet" data-act="enrol-prospectus">Back</button></div>
            <p class="small muted mt-2">Draw your signature in the box and type your full name as it appears on your record. ${W.fee && !W.paid ? `Signing opens the store's payment sheet for the ${esc(W.fee)} enrolment fee; the schedule is then fixed.` : 'Signing enrols you; the schedule is then fixed.'}</p>` : '';
      const h1 = W.step === 4 && W.teach ? 'Published' : W.step === 4 ? 'Registration contract' : W.step === 3 ? 'Prospectus' : W.step === 2 && W.plans ? 'Choose a pace' : W.teach ? 'New cohort course' : 'Add a course';
      const lede = W.step === 1 ? 'Add the material. It comes back as a course with a fixed term and a daily block.' : W.step === 4 ? 'Read it, sign it, and the term begins.' : W.step === 3 ? 'Enrolling makes these terms binding.' : W.plans ? 'Three pacings. Pick one.' : 'Reading your material…';
      return `<div class="page"><div class="page-head"><div><h1 class="display">${h1}</h1><p class="lede">${lede}</p></div></div>${steps()}${body}</div>`;
    },
    async mount(root, p, q) {
      if (W.step === 4 && !W.teach) L.papers.mountPad(root);
      window.__prospectus = W.prospectus || null;
      if (q.teach === '1' && !W.teach) { if (!L.cohort.isInstructor()) { L.ui.toast('Sign in as an instructor under More first.', 'warn'); L.go('/settings'); return; } reset(); W.teach = true; history.replaceState(null, '', location.pathname + location.search + '#/enrol'); L.render(); return; }
      if (q.join && !W.busy) { reset(); W.joinCode = L.cohort.normCode(q.join); history.replaceState(null, '', location.pathname + location.search + '#/enrol'); await L.actions['join-cohort'](); return; }
      if (q.lib && !W.sampleLoaded && !W.busy) {
        W.sampleLoaded = true;
        history.replaceState(null, '', location.pathname + location.search + '#/enrol');
        const busy = L.ui.busy('Fetching the title from the Lyceum library…');
        try {
          const t = await L.library.title(q.lib);
          const pack = await L.library.pack(q.lib, (m) => busy.update(m));
          W.sources = [L.intake.fromPack(pack, t ? t.title : q.lib)];
          W.hint = t ? t.title : '';
          L.ui.toast(`${W.sources[0].name} · ${L.fmt.num(W.sources[0].words)} words · ${W.sources[0].attribution ? W.sources[0].attribution.license : ''}`, 'good', 4000);
          await L.actions['submit-registrar']();
        } catch (e) { W.error = e.message; L.render(); }
        finally { busy.done(); }
        return;
      }
      if (q.sample === '1' && !W.sampleLoaded && !W.busy) {
        W.sampleLoaded = true;
        W.sources = [Object.assign(L.intake.fromText(L.SAMPLE.text, L.SAMPLE.name), { kind: 'markdown' })];
        W.hint = '';
        L.ui.toast('Sample material loaded. It will be scheduled like any real course.', 'info', 4000);
        history.replaceState(null, '', location.pathname + location.search + '#/enrol');
        await L.actions['submit-registrar']();
        return;
      }
      const drop = root.querySelector('#drop'); const input = root.querySelector('#file-input');
      if (drop && input) {
        ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
        ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
        drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
        input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
      }
    },
    unmount() { window.__prospectus = null; },
  };
  async function addFiles(files) {
    for (const f of Array.from(files || [])) {
      const busy = L.ui.busy(`Reading ${f.name}…`);
      try { const src = await L.intake.fromFile(f, (m) => busy.update(m)); if (src.words < 50) throw new Error(`${f.name} has almost no text (${src.words} words).`); W.sources.push(src); L.ui.toast(`Added ${f.name} · ${L.fmt.num(src.words)} words.`, 'good'); }
      catch (e) { L.ui.toast(e.message, 'bad', 6000); }
      finally { busy.done(); }
    }
    W.error = null; L.render();
  }
  L.actions['pick-file'] = () => document.getElementById('file-input')?.click();
  L.actions['add-text'] = () => {
    const ta = document.getElementById('paste'); const text = (ta?.value || '').trim();
    if (text.split(/\s+/).length < 50) { L.ui.toast('Paste at least a few paragraphs.', 'warn'); return; }
    const src = L.intake.fromText(text, `Pasted text ${W.sources.filter((s) => /^Pasted/.test(s.name)).length + 1}`);
    W.sources.push(src); W.error = null; L.render();
  };
  L.actions['add-url'] = async () => {
    const url = (document.getElementById('url')?.value || '').trim(); if (!url) return;
    const busy = L.ui.busy(`Fetching ${url}…`);
    try { const src = await L.intake.fromUrl(url); W.sources.push(src); W.error = null; L.ui.toast(`Fetched ${src.name} · ${L.fmt.num(src.words)} words.`, 'good'); }
    catch (e) { L.ui.toast(e.message, 'bad', 7000); }
    finally { busy.done(); L.render(); }
  };
  L.actions['remove-source'] = (el) => { W.sources = W.sources.filter((s) => s.id !== el.dataset.id); L.render(); };
  L.actions['clear-sources'] = () => { W.sources = []; W.error = null; L.render(); };
  L.inputs.hint = (el) => { W.hint = el.value; };
  L.actions['enrol-back'] = () => { W.step = 1; W.plans = null; W.prospectus = null; W.error = null; W.log = []; L.render(); };
  L.inputs['join-code'] = (el) => { W.joinCode = L.cohort.normCode(el.value); el.value = W.joinCode; };
  L.inputs['term-start'] = (el) => { if (!W.input) return; W.start = el.value; try { W.plans = R().plans(Object.assign({}, W.input, { teach: true, start: W.start })); } catch (e) { W.error = e.message; } L.render(); };
  // a code fetches the instructor's plan; the student reads the prospectus and signs like anyone else
  L.actions['join-cohort'] = async () => {
    const code = L.cohort.normCode(W.joinCode || (document.getElementById('join-code') || {}).value);
    if (code.length !== 6) { W.joinError = 'A cohort code has six letters and digits.'; L.render(); return; }
    W.busy = true; W.joinError = null; L.render();
    const busy = L.ui.busy('Fetching the cohort…');
    try {
      const data = await L.cohort.fetchCohort(code);
      if (data.closed) throw new Error('This cohort is closed to new students.');
      if (data.term.start < L.date.iso(L.today())) throw new Error(`This cohort's term began ${L.fmt.date(data.term.start)}; enrolment closed at the start of term.`);
      const p = await L.cohort.prospectusFor(data, (m) => busy.update(m));
      const why = R().fits(p); if (why) throw new Error(why);
      W.cohort = data; W.prospectus = p; W.step = 3; W.error = null;
    } catch (e) { W.joinError = e.message; }
    finally { W.busy = false; busy.done(); L.render(); }
  };
  L.actions['publish-cohort'] = async () => {
    const p = W.prospectus; if (!p || !W.teach || W.busy) return;
    W.busy = true; W.error = null; L.render();
    const busy = L.ui.busy('Publishing…');
    try { W.published = await L.cohort.publish(p, (m) => busy.update(m)); W.step = 4; L.ui.toast(`Cohort ${W.published} is open for enrolment.`, 'good', 5000); }
    catch (e) { W.error = e.message; }
    finally { W.busy = false; busy.done(); L.render(); }
  };
  L.actions['copy-join'] = async (el) => { const link = L.cohort.joinLink(el.dataset.code); try { await navigator.clipboard.writeText(link); L.ui.toast('Link copied.', 'good'); } catch (e) { L.ui.modal({ title: 'Join link', body: `<p class="mono small" style="word-break:break-all">${esc(link)}</p>` }); } };
  L.actions['enrol-discard'] = () => { reset(); L.render(); L.ui.toast('Prospectus discarded. Nothing was recorded.'); };
  L.actions['choose-pace'] = (el) => { const p = W.plans && W.plans[el.dataset.pace]; if (!p || p.unavailable) return; W.prospectus = p; W.step = 3; L.render(); };
  L.actions['enrol-paces'] = () => { W.prospectus = null; W.step = 2; L.render(); };

  L.actions['submit-registrar'] = async () => {
    if (!W.sources.length || W.busy) return;
    W.busy = true; W.step = 2; W.plans = null; W.prospectus = null; W.error = null; W.log = [];
    const log = (m) => { W.log.push(m); const el = document.getElementById('registrar-log'); if (el) { const d = document.createElement('div'); d.textContent = m; el.appendChild(d); } };
    L.render();
    try {
      // sources are already normalised; join them as-is so each one's page offsets stay valid
      let pos = 0;
      for (const s of W.sources) { s.offset = pos; pos += s.text.length + 2; }
      const text = W.sources.map((s) => s.text).join('\n\n');
      const words = L.intake.words(text);
      log(`Reading ${W.sources.length} source${W.sources.length === 1 ? '' : 's'} · ${L.fmt.num(words)} words`);
      const segments = L.intake.segment(text, { sources: W.sources });
      log(`${segments.length} segment${segments.length === 1 ? '' : 's'} found`);
      const t0 = Date.now();
      if (L.faculty.available()) log('Consulting faculty…');
      const r = await L.faculty.analyze({ segments, text, hint: W.hint.trim(), words, sourceName: W.sources[0].name, onModel: (m) => log(`Faculty: ${m}`) });
      if (r.source === 'llm') log(`Faculty (${r.model}) replied in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      else log(r.note || 'Analysed by the offline registrar');
      const analysis = Object.assign({}, r.analysis, { source: r.source, model: r.model, note: r.note });
      log(`${analysis.units.length} units · ${analysis.level} · difficulty ${analysis.difficulty}/5`);
      log('Drawing up three pacings…');
      W.input = { analysis, segments, text, sources: W.sources, words };
      W.plans = R().plans(Object.assign({}, W.input, { teach: W.teach, start: W.start || null }));
      log(['condensed', 'standard', 'extended'].map((k) => `${k}: ${W.plans[k].unavailable ? 'unavailable' : W.plans[k].term.weeks + ' weeks'}`).join(' · '));
    } catch (e) {
      console.error(e);
      W.error = e.message || 'The registrar could not schedule this material.';
    } finally { W.busy = false; L.render(); }
  };
  // the store's price is fetched before the contract is shown, so the sheet renders once and a drawn signature is never wiped
  L.actions['enrol-confirm'] = async () => {
    if (!W.prospectus || W.busy) return;
    W.fee = null; W.paid = null;
    if (!W.cohort && L.store.required()) { W.busy = true; L.render(); try { const pr = await L.store.price(); W.fee = pr ? pr.priceString : null; } catch (e) { W.fee = null; } W.busy = false; }
    W.contractNo = L.papers.contractNo(); W.error = null; W.step = 4; L.render();
  };
  L.actions['enrol-prospectus'] = () => { W.step = 3; W.error = null; L.render(); };
  L.actions['sign-enrol'] = async () => {
    const p = W.prospectus; if (!p) return;
    const nameEl = document.getElementById('contract-name');
    const typed = (nameEl ? nameEl.value : '').trim();
    const pad = L.papers.pad;
    const norm = (x) => x.trim().toLowerCase().replace(/\s+/g, ' ');
    // validation must not re-render: that would wipe the drawn signature and scroll away from the error
    const fail = (msg) => { let n = document.getElementById('contract-error'); if (!n) { n = document.createElement('div'); n.id = 'contract-error'; n.className = 'notice mt-2'; n.dataset.kind = 'bad'; const btn = document.querySelector('[data-act=sign-enrol]'); btn.closest('.cols').before(n); } n.innerHTML = `<span>${esc(msg)}</span>`; n.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    if (norm(typed) !== norm(L.S.student.name)) { fail(`Type your name exactly as it appears on your record: ${L.S.student.name}.`); if (nameEl) nameEl.focus(); return; }
    if (!pad || pad.points < 20) { fail('Draw your signature in the box.'); return; }
    const signature = pad.dataUrl();
    if (!signature) { fail('Draw your signature in the box.'); return; }
    W.busy = true;
    const btn = document.querySelector('[data-act=sign-enrol]'); if (btn) { btn.disabled = true; btn.textContent = W.fee && !W.paid ? 'Waiting for the store…' : 'Enrolling…'; }
    try {
      // the fee is paid once; a purchase that already went through (server unreachable afterwards) is settled, not repeated
      if (!W.cohort && L.store.required() && !W.paid) W.paid = await L.store.buy(p);
      const c = await R().enrol(p, { no: W.contractNo, name: typed, signature, fee: W.fee || null }, W.paid || null);
      if (c.cohort) { try { await L.cohort.join(c); } catch (e) { console.error(e); L.ui.toast(`Enrolled, but the cohort could not be joined yet: ${e.message}`, 'warn', 8000); } }
      reset();
      L.ui.toast(`Enrolled in ${c.code}. Term begins ${L.fmt.date(c.term.start)}.`, 'good', 5000);
      L.go(`/course/${c.id}`);
    } catch (e) { W.busy = false; fail(e.message); if (btn) { btn.disabled = false; btn.textContent = W.fee && !W.paid ? `Sign and pay ${W.fee}` : 'Sign and enrol'; } return; }
    finally { W.busy = false; }
  };
})(window.L);
