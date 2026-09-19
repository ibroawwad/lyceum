window.L = window.L || {};
(function (L) {
  'use strict';

  L.VERSION = 1;
  const KEY = 'lyceum.v1';
  const THEME_KEY = 'lyceum.theme';

  // ---------- small utilities ----------
  L.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  L.clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  L.sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);
  L.by = (key) => {
    const f = typeof key === 'function' ? key : (o) => o[key];
    return (a, b) => { const x = f(a), y = f(b); return x < y ? -1 : x > y ? 1 : 0; };
  };
  L.cc = (c) => (c && c.color) || '#d4a24c'; // a course's colour, HabitKit-style
  L.groupBy = (arr, fn) => arr.reduce((m, x) => { const k = typeof fn === 'function' ? fn(x) : x[fn]; (m[k] = m[k] || []).push(x); return m; }, {});
  L.uid = (prefix = 'x') => {
    const b = new Uint8Array(6); crypto.getRandomValues(b);
    return prefix + '_' + Array.from(b, (n) => (n % 36).toString(36)).join('') + (Date.now() % 1296).toString(36).padStart(2, '0');
  };
  L.sha256 = async (str) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  };

  // ---------- event bus ----------
  const handlers = {};
  L.on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
  L.off = (ev, fn) => { handlers[ev] = (handlers[ev] || []).filter((f) => f !== fn); };
  L.emit = (ev, payload) => { (handlers[ev] || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } }); };

  // ---------- state ----------
  function defaults() {
    return {
      version: L.VERSION,
      student: null,
      settings: { apiKey: '', apiBase: '', iapDevSecret: '', model: 'anthropic/claude-fable-5.1', weeklyHours: 12, theme: 'dark' },
      clock: { offsetMs: 0 },
      courses: [],
      ledger: [],
      ui: { collapsed: {}, lastRoute: '' },
    };
  }
  function migrate(s) {
    const d = defaults();
    const out = Object.assign(d, s || {});
    out.settings = Object.assign(d.settings, s?.settings || {});
    if (out.settings.theme === 'system' && !out.settings.themeChosen) out.settings.theme = 'dark'; // dark is the default until the student picks
    out.clock = Object.assign(d.clock, s?.clock || {});
    out.ui = Object.assign(d.ui, s?.ui || {});
    out.courses = (Array.isArray(s?.courses) ? s.courses : []).filter((c) => {
      const ok = c && c.id && c.term && c.plan && Array.isArray(c.sessions) && Array.isArray(c.assessments) && Array.isArray(c.weeks) && c.material && c.policy;
      if (!ok) console.warn('Lyceum: skipped a corrupt course record', c && c.id);
      return ok;
    });
    out.ledger = Array.isArray(s?.ledger) ? s.ledger : [];
    out.device = typeof s?.device === 'string' ? s.device : null;
    out.pendingPurchases = Array.isArray(s?.pendingPurchases) ? s.pendingPurchases : [];
    out.instructor = s?.instructor && s.instructor.key ? s.instructor : null;
    out.version = L.VERSION;
    return out;
  }
  L.load = () => {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
    let parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { console.warn('Lyceum: stored record unreadable, starting fresh'); } }
    L.S = migrate(parsed);
    return L.S;
  };
  let saveTimer = null;
  L.storageProblem = null; // set when the record cannot be written; the UI shows it until it clears
  L.saveNow = () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try { localStorage.setItem(KEY, JSON.stringify(L.S)); L.storageProblem = null; if (L.native) { L.native.saveRecord(); L.native.rescheduleSoon(); } }
    catch (e) {
      console.error('Lyceum: could not save', e);
      L.storageProblem = /quota/i.test(e.name + e.message) ? 'Storage is full on this device. Export your record from Settings, then erase old courses.' : 'This device refused to save the record: ' + e.message;
      if (L.ui) L.ui.toast(L.storageProblem, 'bad', 8000);
    }
    L.emit('state');
  };
  L.save = () => { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(L.saveNow, 150); };
  L.reset = async () => {
    try { localStorage.removeItem(KEY); localStorage.removeItem(THEME_KEY); } catch (e) { /* ignore */ }
    try { await new Promise((res) => { const r = indexedDB.deleteDatabase('lyceum'); r.onsuccess = r.onerror = r.onblocked = () => res(); }); } catch (e) { /* ignore */ }
    location.replace(location.pathname + location.search + '#/welcome');
    location.reload();
  };

  // ---------- clock ----------
  L.API_BASE = typeof window.LYCEUM_API === 'string' ? window.LYCEUM_API.trim().replace(/\/$/, '') : '';
  L.debug = (() => { try { return new URLSearchParams(location.search).has('debug'); } catch (e) { return false; } })();
  L.now = () => Date.now() + (L.S?.clock?.offsetMs || 0);
  L.today = () => L.date.startOfDay(new Date(L.now()));
  L.clock = {
    async setOffset(ms) {
      if (!L.debug) throw new Error('The registrar clock can only be moved in debug mode.');
      const from = L.S.clock.offsetMs || 0;
      L.S.clock.offsetMs = Math.round(ms);
      await L.ledger.append('clock_override', { fromMs: from, toMs: L.S.clock.offsetMs, now: new Date(L.now()).toISOString() });
      L.save();
    },
    async reset() {
      const from = L.S.clock.offsetMs || 0;
      L.S.clock.offsetMs = 0;
      if (from !== 0) await L.ledger.append('clock_reset', { fromMs: from });
      L.save();
    },
  };

  // ---------- dates (local wall-clock) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  L.date = {
    parse(v) {
      if (v instanceof Date) return new Date(v.getTime());
      if (typeof v === 'number') return new Date(v);
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00');
      return new Date(v);
    },
    iso(d) { d = L.date.parse(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
    isoLocal(d) { d = L.date.parse(d); return `${L.date.iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; },
    startOfDay(d) { d = L.date.parse(d); d.setHours(0, 0, 0, 0); return d; },
    addDays(d, n) { d = L.date.parse(d); d.setDate(d.getDate() + n); return d; },
    addMin(d, n) { d = L.date.parse(d); d.setMinutes(d.getMinutes() + n); return d; },
    setTime(d, h, m = 0, s = 0) { d = L.date.parse(d); d.setHours(h, m, s, 0); return d; },
    dow(d) { d = L.date.parse(d); return (d.getDay() + 6) % 7; },
    nextMonday(from) {
      const now = from ? L.date.parse(from) : new Date(L.now());
      const day = L.date.startOfDay(now);
      const dow = L.date.dow(day);
      if (dow === 0 && now.getHours() < 8) return day;
      return L.date.addDays(day, 7 - dow);
    },
    dayName: (d) => DAYS[L.date.dow(d)],
    monthName: (d) => MONTHS[L.date.parse(d).getMonth()],
  };
  L.fmt = {
    date(d) { d = L.date.parse(d); return `${DAYS[L.date.dow(d)].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; },
    dateLong(d) { d = L.date.parse(d); return `${DAYS[L.date.dow(d)]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; },
    time(d) { d = L.date.parse(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; },
    dt(d) { return `${L.fmt.date(d)}, ${L.fmt.time(d)}`; },
    rel(ms) {
      const past = ms < 0; const a = Math.abs(ms);
      let s;
      if (a < 60e3) return 'now';
      if (a < 3600e3) s = `${Math.round(a / 60e3)} min`;
      else if (a < 86400e3) { const h = Math.floor(a / 3600e3); const m = Math.round((a % 3600e3) / 60e3); s = m ? `${h}h ${m}m` : `${h}h`; }
      else { const d = Math.floor(a / 86400e3); const h = Math.round((a % 86400e3) / 3600e3); s = h ? `${d}d ${h}h` : `${d}d`; }
      return past ? `${s} ago` : `in ${s}`;
    },
    dur(min) { const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`; },
    pct(n) { return n == null || isNaN(n) ? '—' : `${(Math.round(n * 10) / 10).toFixed(1)}%`; },
    num(n) { return Number(n || 0).toLocaleString('en-GB'); },
    clock(d) { d = L.date.parse(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; },
  };

  // ---------- IndexedDB for materials ----------
  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open('lyceum', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('materials')) db.createObjectStore('materials');
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files'); // original documents (PDF bytes, HTML)
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { console.warn('Lyceum: IndexedDB unavailable', req.error); resolve(null); };
    });
    return dbPromise;
  }
  function tx(mode, fn, storeName = 'materials') {
    return openDb().then((db) => new Promise((resolve, reject) => {
      if (!db) return resolve(null);
      const t = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      const req = fn(store);
      t.oncomplete = () => resolve(req && 'result' in req ? req.result : null);
      t.onerror = () => reject(t.error);
    }));
  }
  const all = (storeName) => openDb().then((db) => new Promise((resolve, reject) => {
    if (!db) return resolve({});
    const out = {};
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).openCursor();
    req.onsuccess = () => { const c = req.result; if (!c) return resolve(out); out[c.key] = c.value; c.continue(); };
    req.onerror = () => reject(req.error);
  }));
  L.db = {
    putMaterial: (id, text) => tx('readwrite', (s) => s.put(text, id)).then((r) => { if (L.native) L.native.putMaterial(id, text); return r; }),
    getMaterial: (id) => tx('readonly', (s) => s.get(id)).then(async (r) => (r == null ? (L.native ? L.native.getMaterial(id) : null) : r)),
    deleteMaterial: (id) => tx('readwrite', (s) => s.delete(id)),
    allMaterials: () => all('materials'),
    // originals: { kind:'pdf', name, blob: Blob } | { kind:'html', name, html }. Blobs are what iOS Safari stores reliably.
    putFile: (id, file) => tx('readwrite', (s) => s.put(file.bytes ? { kind: file.kind, name: file.name, blob: new Blob([file.bytes], { type: 'application/pdf' }) } : file, id), 'files').then((r) => { if (L.native) L.native.putFile(id, file); return r; }),
    getFile: (id) => tx('readonly', (s) => s.get(id), 'files').then(async (r) => { if (r == null) return L.native ? L.native.getFile(id) : null; if (r.blob && !r.bytes) r.bytes = await r.blob.arrayBuffer(); return r; }),
    deleteFile: (id) => tx('readwrite', (s) => s.delete(id), 'files'),
    allFiles: () => all('files'),
  };

  // ---------- ledger (hash chain) ----------
  let queue = Promise.resolve();
  function entryBytes(e) {
    const body = { i: e.i, t: e.t, type: e.type };
    if (e.courseId !== undefined) body.courseId = e.courseId;
    if (e.ref !== undefined) body.ref = e.ref;
    body.detail = e.detail;
    return e.prev + '|' + JSON.stringify(body);
  }
  L.ledger = {
    append(type, detail = {}) {
      const run = async () => {
        const prev = L.S.ledger.length ? L.S.ledger[L.S.ledger.length - 1].hash : '0';
        const e = { i: L.S.ledger.length, t: new Date(L.now()).toISOString(), type, detail, prev };
        if (detail.courseId !== undefined) e.courseId = detail.courseId;
        if (detail.ref !== undefined) e.ref = detail.ref;
        e.hash = await L.sha256(entryBytes(e));
        L.S.ledger.push(e);
        L.save();
        return e;
      };
      queue = queue.then(run, run);
      return queue;
    },
    async verify() {
      let prev = '0';
      for (let i = 0; i < L.S.ledger.length; i++) {
        const e = L.S.ledger[i];
        if (e.i !== i || e.prev !== prev) return { ok: false, brokenAt: i };
        const h = await L.sha256(entryBytes(e));
        if (h !== e.hash) return { ok: false, brokenAt: i };
        prev = e.hash;
      }
      return { ok: true, brokenAt: null };
    },
  };

  // ---------- export / import ----------
  const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (str) => { const bin = atob(str); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const FILE_EXPORT_LIMIT = 40 * 1024 * 1024;
  L.exportRecord = async () => {
    const state = JSON.parse(JSON.stringify(L.S));
    state.settings.apiKey = ''; state.instructor = null; // a record export is meant to travel; keys are not
    const files = await L.db.allFiles();
    let bytes = 0;
    for (const f of Object.values(files)) bytes += f.blob ? f.blob.size : f.bytes ? f.bytes.byteLength : (f.html || '').length;
    const out = { version: L.VERSION, exportedAt: new Date().toISOString(), state, materials: await L.db.allMaterials() };
    if (bytes <= FILE_EXPORT_LIMIT) {
      out.files = {};
      for (const [id, f] of Object.entries(files)) {
        const raw = f.blob ? await f.blob.arrayBuffer() : f.bytes;
        out.files[id] = raw ? { kind: f.kind, name: f.name, bytes64: b64(raw) } : f;
      }
    } else out.filesOmitted = bytes;
    return out;
  };
  L.importRecord = async (obj) => {
    if (!obj || typeof obj !== 'object' || !obj.state || !Array.isArray(obj.state.courses)) {
      throw new Error('That file is not a Lyceum record export.');
    }
    const next = migrate(obj.state);
    Object.keys(L.S).forEach((k) => delete L.S[k]);
    Object.assign(L.S, next);
    for (const [id, text] of Object.entries(obj.materials || {})) await L.db.putMaterial(id, text);
    for (const [id, f] of Object.entries(obj.files || {})) await L.db.putFile(id, f.bytes64 ? { kind: f.kind, name: f.name, bytes: unb64(f.bytes64) } : f);
    await L.ledger.append('data_imported', { courses: L.S.courses.length, exportedAt: obj.exportedAt || null });
    L.saveNow();
    if (L.render) L.render();
  };

  // ---------- marble ----------
  // The ground is stone: soft clouds and a few veins that wander (a fractal-noise displacement of smooth curves),
  // drawn once per theme as one SVG and fixed behind everything at low opacity. Cream veins on the burgundy, faint
  // burgundy veins on the cream. Deterministic, so the stone looks the same on every visit.
  let marbleFor = null;
  function marble(dark) {
    const ink = dark ? '#f4ecdf' : '#5a1a22';
    const cloud = dark ? '1 1 1' : '0.35 0.1 0.13';
    let r = 7; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    const veins = [];
    for (let i = 0; i < 8; i++) {
      const x0 = -200 + rnd() * 1700, y0 = -150 + rnd() * 200, x1 = x0 - 400 + rnd() * 1000, y1 = 1400 + rnd() * 200;
      const c1x = x0 + 250 - rnd() * 500, c2x = x1 - 250 + rnd() * 500;
      const d = `M${x0.toFixed(0)} ${y0.toFixed(0)} C ${c1x.toFixed(0)} ${(y0 + 550).toFixed(0)}, ${c2x.toFixed(0)} ${(y1 - 550).toFixed(0)}, ${x1.toFixed(0)} ${y1.toFixed(0)}`;
      const w = 0.9 + rnd() * 1.3, o = 0.3 + rnd() * 0.5;
      veins.push(`<path d="${d}" stroke="${ink}" stroke-width="${(w * 7).toFixed(1)}" opacity="${(o * 0.18).toFixed(2)}" fill="none"/><path d="${d}" stroke="${ink}" stroke-width="${w.toFixed(1)}" opacity="${o.toFixed(2)}" fill="none"/>`);
    }
    const [cr, cg, cb] = cloud.split(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1400" viewBox="0 0 1400 1400"><filter id="m" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.0022" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="420" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="1.3"/></filter><filter id="c" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.0045" numOctaves="3" seed="12"/><feColorMatrix type="matrix" values="0 0 0 0 ${cr}  0 0 0 0 ${cg}  0 0 0 0 ${cb}  0 0 0 0.9 -0.25"/></filter><rect width="1400" height="1400" filter="url(#c)" opacity="${dark ? 0.55 : 0.4}"/><g filter="url(#m)">${veins.join('')}</g></svg>`;
  }

  // ---------- theme ----------
  L.theme = {
    set(mode) {
      const root = document.documentElement;
      if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode); else root.removeAttribute('data-theme');
      try { if (mode === 'light' || mode === 'dark') localStorage.setItem(THEME_KEY, mode); else localStorage.removeItem(THEME_KEY); } catch (e) { /* ignore */ }
      if (L.S) { L.S.settings.theme = mode; L.S.settings.themeChosen = true; L.save(); }
      L.theme.sync();
    },
    // the browser chrome and the native status bar follow the effective theme
    isDark() { const t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches); },
    sync() {
      const dark = L.theme.isDark(); const bg = dark ? '#1b090d' : '#f3efe6';
      const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', bg);
      if (L.native && L.native.statusBar) L.native.statusBar(dark, bg);
      if (marbleFor !== dark) { marbleFor = dark; document.documentElement.style.setProperty('--marble', `url("data:image/svg+xml,${encodeURIComponent(marble(dark))}")`); }
    },
    apply() { const chosen = L.S?.settings?.themeChosen; L.theme.set(L.S?.settings?.theme || 'dark'); if (L.S && !chosen) { L.S.settings.themeChosen = false; } },
  };

  // ---------- ui helpers ----------
  const $ = (sel) => document.querySelector(sel);
  L.ui = {
    toast(message, kind = 'info', ms = 3200) {
      const host = $('#toasts'); if (!host) return;
      const el = document.createElement('div');
      el.className = 'toast'; el.dataset.kind = kind; el.textContent = message;
      host.appendChild(el);
      while (host.children.length > 4) host.firstChild.remove();
      setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 250); }, ms);
    },
    modal({ title, body = '', actions = [], wide = false, onAction }) {
      const host = $('#modals'); if (!host) return;
      host.innerHTML = `
        <div class="modal-backdrop" data-act="modal-cancel"></div>
        <div class="modal${wide ? ' is-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 id="modal-title" class="modal-title">${L.esc(title)}</h2>
          <div class="modal-body">${body}</div>
          <div class="modal-actions">${actions.map((a) => `<button class="btn ${a.primary ? (a.danger ? 'btn-danger' : 'btn-primary') : 'btn-quiet'}" data-act="${L.esc(a.act)}">${L.esc(a.label)}</button>`).join('')}</div>
        </div>`;
      host.classList.add('is-open');
      host._onAction = onAction;
      const first = host.querySelector('.modal-actions .btn-primary, .modal-actions .btn-danger, .modal-actions .btn');
      if (first) first.focus();
    },
    closeModal() { const host = $('#modals'); if (!host) return; host.classList.remove('is-open'); host.innerHTML = ''; host._onAction = null; },
    confirm({ title, body = '', ok = 'Confirm', cancel = 'Cancel', danger = false }) {
      return new Promise((resolve) => {
        L.ui.modal({
          title, body,
          actions: [{ label: cancel, act: 'modal-cancel' }, { label: ok, act: 'modal-ok', primary: true, danger }],
          onAction: (act) => { L.ui.closeModal(); resolve(act === 'modal-ok'); },
        });
      });
    },
    busy(label) {
      const host = $('#main') || document.body;
      let el = host.querySelector('.busy');
      if (!el) { el = document.createElement('div'); el.className = 'busy'; el.innerHTML = '<div class="busy-bar"><i></i></div><div class="log"></div>'; host.prepend(el); }
      const log = el.querySelector('.log');
      const add = (t) => { const line = document.createElement('div'); line.textContent = t; log.appendChild(line); };
      add(label);
      return { update: add, done() { el.remove(); } };
    },
  };
  document.addEventListener('click', (ev) => {
    const host = $('#modals');
    if (!host || !host.classList.contains('is-open')) return;
    const el = ev.target.closest('[data-act]');
    if (!el || !host.contains(el)) return;
    const act = el.dataset.act;
    ev.preventDefault(); ev.stopPropagation();
    if (act === 'modal-ok' || act === 'modal-cancel') { if (host._onAction) host._onAction(act); else L.ui.closeModal(); return; }
    // other actions inside a modal go to the normal registry (the global handler ignores #modals)
    const fn = L.actions && L.actions[act];
    if (fn) Promise.resolve(fn(el, ev)).catch((e) => { console.error(e); L.ui.toast(e.message || 'Something went wrong.', 'bad'); });
  }, true);
  document.addEventListener('keydown', (ev) => {
    const host = $('#modals');
    if (ev.key === 'Escape' && host && host.classList.contains('is-open')) { if (host._onAction) host._onAction('modal-cancel'); else L.ui.closeModal(); }
  });

  // ---------- boot ----------
  L.load();
  L.theme.apply();
  try { window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => L.theme.sync()); } catch (e) { /* older WebKit */ }
  window.addEventListener('pagehide', L.saveNow);
  window.addEventListener('beforeunload', L.saveNow);
  setInterval(() => L.emit('tick'), 1000);
  setInterval(() => { if (L.registrar) L.registrar.sweep().catch((e) => console.error(e)); }, 20000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => L.boot && L.boot());
  else setTimeout(() => L.boot && L.boot(), 0);
})(window.L);
