(function (L) {
  'use strict';
  // Cohorts. An instructor publishes a course plan (the registrar's prospectus plus the material) under a six-letter
  // code; students join with the code and enrol on the very same term, days and papers. Each student's progress is
  // reported to the server so the class can see itself. Instructors hold a key issued on the server.
  const base = () => (L.S?.settings?.apiBase || L.API_BASE || '').trim().replace(/\/$/, '');
  const key = () => (L.S?.instructor?.key || '').trim();
  const iso = () => new Date(L.now()).toISOString();
  const needServer = () => { if (!base()) throw new Error('Cohorts need the Lyceum server. Set it under More → Faculty.'); };
  async function api(path, { method = 'GET', body, raw, instructor = false, timeout = 60000 } = {}) {
    needServer();
    const headers = {}; if (body && !raw) headers['Content-Type'] = 'application/json'; if (instructor) headers['X-Instructor-Key'] = key();
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    let r;
    try { r = await fetch(base() + path, { method, headers, body: raw ? body : body ? JSON.stringify(body) : undefined, signal: ctl.signal }); }
    catch (e) { throw new Error(`The Lyceum server could not be reached (${e.name === 'AbortError' ? 'timeout' : 'network'}).`); }
    finally { clearTimeout(t); }
    if (raw === 'bytes') { if (!r.ok) throw new Error(`The server answered ${r.status}.`); return r.arrayBuffer(); }
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok) throw new Error((j && j.error) || `The server answered ${r.status}.`);
    return j;
  }
  const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);

  // ---------- students ----------
  const fetchCohort = (code) => api(`/v1/cohorts/${normCode(code)}`);
  // the plan becomes a Prospectus again: the text pack and any original files are fetched so the course is complete on the device
  async function prospectusFor(data, onProgress = () => {}) {
    onProgress('Fetching the material…');
    const pack = await api(`/v1/cohorts/${data.code}/material`);
    const p = Object.assign({}, data.course, { sourcesText: pack.text, sourceFiles: [], cohort: { code: data.code, title: data.title, instructor: data.instructor, members: data.members, joinedAt: null } });
    for (const src of (p.material && p.material.sources) || []) {
      if (!src.hasFile) continue;
      try { onProgress(`Fetching ${src.name}…`); const bytes = await api(`/v1/cohorts/${data.code}/file/${src.id}`, { raw: 'bytes', timeout: 180000 }); p.sourceFiles.push({ id: src.id, file: { kind: src.kind === 'pdf' ? 'pdf' : 'html', name: src.name, bytes } }); }
      catch (e) { console.error(e); src.hasFile = false; }
    }
    return p;
  }
  // the class roster and the entitlement that pays for the faculty come back from the server on joining
  async function join(c) {
    const r = await api(`/v1/cohorts/${c.cohort.code}/join`, { method: 'POST', body: { device: L.store.deviceId(), studentId: L.S.student.id, name: L.S.student.name } });
    c.cohort.joinedAt = iso(); c.cohort.roster = r.roster; c.cohort.members = r.cohort.members;
    if (r.entitlement && !c.entitlement) c.entitlement = Object.assign({ tx: null, productId: null, courseHash: 'cohort:' + c.cohort.code, sandbox: false, at: iso() }, r.entitlement);
    L.saveNow();
    return r;
  }
  function progressOf(c) {
    const R = L.registrar; const st = R.standing(c); const stats = R.stats().perCourse.find((x) => x.course.id === c.id);
    const chunks = c.sessions.flatMap((s) => s.chunks);
    return { chunksDone: chunks.filter((k) => k.done).length, chunksTotal: chunks.length, pct: st.current == null ? null : st.current, letter: st.current == null ? null : R.letter(st.current), streak: stats ? stats.streak : 0, week: R.currentWeek(c), papers: c.assessments.filter((a) => a.grade).length, state: c.state };
  }
  // progress goes up at most every ten minutes per course, or at once when asked (a tick, the Class tab)
  const pushed = new Map();
  async function push(c, force = false) {
    if (!c.cohort || !base()) return null;
    const last = pushed.get(c.id) || 0; if (!force && Date.now() - last < 600000) return null;
    pushed.set(c.id, Date.now());
    try { const r = await api(`/v1/cohorts/${c.cohort.code}/progress`, { method: 'POST', body: { device: L.store.deviceId(), progress: progressOf(c) }, timeout: 20000 }); c.cohort.roster = r.roster; c.cohort.members = r.roster.length; L.save(); return r.roster; }
    catch (e) { console.warn('cohort progress', e.message); return null; }
  }
  let soonTimer = null;
  const pushSoon = () => { clearTimeout(soonTimer); soonTimer = setTimeout(() => { for (const c of L.S.courses) if (c.cohort && c.state === 'enrolled') push(c, true); }, 3000); };
  const pushAll = () => { for (const c of L.S.courses) if (c.cohort && c.state === 'enrolled') push(c); };

  // ---------- instructors ----------
  async function signIn(k) {
    const r = await api('/v1/instructor/whoami', { method: 'POST', body: { key: k.trim() } });
    L.S.instructor = { id: r.id, name: r.name, key: k.trim(), since: iso() }; L.saveNow();
    return r;
  }
  const signOut = () => { L.S.instructor = null; L.saveNow(); };
  const list = () => api('/v1/instructor/cohorts', { instructor: true });
  // publish: the plan without its text, the text pack, then each original file
  async function publish(p, onProgress = () => {}) {
    const course = Object.assign({}, p); delete course.sourcesText; delete course.sourceFiles;
    onProgress('Publishing the plan…');
    const r = await api('/v1/instructor/cohorts', { method: 'POST', instructor: true, timeout: 180000, body: { course, material: { text: p.sourcesText || '', sources: (p.material.sources || []).map((s) => ({ id: s.id, name: s.name, kind: s.kind, hasFile: !!s.hasFile })) } } });
    for (const f of p.sourceFiles || []) {
      try {
        onProgress(`Uploading ${f.file.name || 'a file'}…`);
        const bytes = f.file.bytes ? f.file.bytes : f.file.blob ? await f.file.blob.arrayBuffer() : null;
        if (bytes) await api(`/v1/cohorts/${r.code}/file/${f.id}`, { method: 'PUT', instructor: true, raw: true, body: bytes, timeout: 300000 });
      } catch (e) { console.error(e); onProgress(`Could not upload ${f.file.name || 'a file'}: ${e.message}`); }
    }
    return r.code;
  }
  const close = (code, closed = true) => api(`/v1/cohorts/${code}/close`, { method: 'POST', instructor: true, body: { closed } });
  const joinLink = (code) => `${location.origin}${location.pathname}#/enrol?join=${code}`;

  L.cohort = { normCode, fetchCohort, prospectusFor, join, push, pushSoon, pushAll, progressOf, signIn, signOut, list, publish, close, joinLink, isInstructor: () => !!key() };
})(window.L);
