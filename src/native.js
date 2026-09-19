(function (L) {
  'use strict';
  // Native bridge (Capacitor). Everything here is optional: on the web every call is a no-op or a
  // browser fallback, so the single file keeps working in Safari exactly as before.
  const Cap = () => (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? window.Capacitor : null);
  const plugin = (name) => { const c = Cap(); return c && c.Plugins && c.Plugins[name] ? c.Plugins[name] : null; };
  const isNative = () => !!Cap();

  // ---------- durable record: Documents/lyceum/record.json (iOS backs Documents up to iCloud) ----------
  const DIR = 'DOCUMENTS';
  async function writeText(path, data) { const fs = plugin('Filesystem'); if (!fs) return false; await fs.writeFile({ path, data, directory: DIR, encoding: 'utf8', recursive: true }); return true; }
  async function readText(path) { const fs = plugin('Filesystem'); if (!fs) return null; try { const r = await fs.readFile({ path, directory: DIR, encoding: 'utf8' }); return r.data; } catch (e) { return null; } }
  async function writeBinary(path, arrayBuffer) { const fs = plugin('Filesystem'); if (!fs) return false; await fs.writeFile({ path, data: b64(arrayBuffer), directory: DIR, recursive: true }); return true; }
  async function readBinary(path) { const fs = plugin('Filesystem'); if (!fs) return null; try { const r = await fs.readFile({ path, directory: DIR }); return unb64(r.data); } catch (e) { return null; } }
  const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (str) => { const bin = atob(str); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };

  let recordTimer = null;
  function saveRecord() {
    if (!isNative()) return;
    clearTimeout(recordTimer);
    recordTimer = setTimeout(() => { writeText('lyceum/record.json', JSON.stringify({ savedAt: new Date().toISOString(), state: L.S })).catch((e) => console.error('native save', e)); }, 400);
  }
  // at boot: if the file on disk is newer than what localStorage holds (or localStorage was wiped), restore it
  async function restore() {
    if (!isNative()) return false;
    const raw = await readText('lyceum/record.json'); if (!raw) return false;
    let disk; try { disk = JSON.parse(raw); } catch (e) { return false; }
    const mem = L.S;
    const memLen = (mem.ledger || []).length, diskLen = ((disk.state || {}).ledger || []).length;
    if (!mem.student || diskLen > memLen) { L.S = Object.assign(L.S, disk.state); L.saveNow(); return true; }
    return false;
  }
  // materials and originals are mirrored as files so an evicted IndexedDB is not a data loss
  async function putMaterial(id, text) { if (isNative()) await writeText(`lyceum/materials/${id}.txt`, text).catch(() => null); }
  async function getMaterial(id) { return isNative() ? readText(`lyceum/materials/${id}.txt`) : null; }
  async function putFile(id, file) {
    if (!isNative()) return;
    if (file.bytes) await writeBinary(`lyceum/files/${id}.bin`, file.bytes).catch(() => null);
    else if (file.blob) await writeBinary(`lyceum/files/${id}.bin`, await file.blob.arrayBuffer()).catch(() => null);
    else if (file.html) await writeText(`lyceum/files/${id}.html`, file.html).catch(() => null);
    await writeText(`lyceum/files/${id}.json`, JSON.stringify({ kind: file.kind, name: file.name })).catch(() => null);
  }
  async function getFile(id) {
    if (!isNative()) return null;
    const meta = await readText(`lyceum/files/${id}.json`); if (!meta) return null;
    const m = JSON.parse(meta);
    if (m.kind === 'html') { const html = await readText(`lyceum/files/${id}.html`); return html == null ? null : { kind: 'html', name: m.name, html }; }
    const bytes = await readBinary(`lyceum/files/${id}.bin`); return bytes ? { kind: m.kind, name: m.name, bytes } : null;
  }

  // ---------- notifications: study block, papers opening, due tonight, exam morning ----------
  const hashId = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 2000000000; };
  let notifTimer = null;
  function planNotifications() {
    const now = L.now(); const horizon = now + 21 * 86400000; const out = [];
    for (const c of L.S.courses) {
      if (c.state !== 'enrolled') continue;
      for (const s of c.sessions) {
        const at = L.date.setTime(L.date.parse(s.date), Math.floor(s.start / 60), s.start % 60).getTime();
        if (at > now && at < horizon && s.chunks.some((k) => !k.done)) out.push({ id: hashId('s' + s.id), at, title: `${c.code} · study block`, body: `${s.topic} · ${s.chunks.length} chunks, ${L.fmt.dur(s.minutes)}`, url: `#/course/${c.id}/day/${s.date}` });
      }
      for (const a of c.assessments) {
        if (a.grade) continue;
        const opens = new Date(a.opensAt).getTime(), due = new Date(a.dueAt).getTime();
        if (opens > now && opens < horizon) out.push({ id: hashId('o' + a.id), at: opens, title: `${c.code} · ${a.title} is open`, body: a.durationMin ? `${L.fmt.dur(a.durationMin)} once you begin · closes ${L.fmt.dt(a.dueAt)}` : `Due ${L.fmt.dt(a.dueAt)}`, url: `#/assess/${c.id}/${a.id}` });
        const remind = due - 3 * 3600000;
        if (remind > now && remind < horizon) out.push({ id: hashId('d' + a.id), at: remind, title: `${c.code} · ${a.title} due at ${L.fmt.time(a.dueAt)}`, body: a.lateAllowed ? `Late work loses ${c.policy.late.perDayPct}% a day.` : 'No late submissions.', url: `#/assess/${c.id}/${a.id}` });
        if (a.kind === 'midterm' || a.kind === 'final') { const morning = L.date.setTime(new Date(opens), 8, 30).getTime(); if (morning > now && morning < horizon) out.push({ id: hashId('e' + a.id), at: morning, title: `${c.code} · ${a.title} today`, body: `Window ${L.fmt.time(a.opensAt)}–${L.fmt.time(a.dueAt)} · ${L.fmt.dur(a.durationMin)}`, url: `#/assess/${c.id}/${a.id}` }); }
      }
    }
    return out.sort((x, y) => x.at - y.at).slice(0, 60); // iOS keeps at most 64 pending
  }
  async function scheduleNotifications() {
    const LN = plugin('LocalNotifications'); if (!LN) return;
    try {
      const perm = await LN.checkPermissions(); if (perm.display !== 'granted') { const r = await LN.requestPermissions(); if (r.display !== 'granted') return; }
      const pending = await LN.getPending(); if (pending.notifications && pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      const plan = planNotifications();
      if (plan.length) await LN.schedule({ notifications: plan.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: new Date(n.at - (L.S.clock.offsetMs || 0)) }, extra: { url: n.url } })) });
    } catch (e) { console.error('notifications', e); }
  }
  const rescheduleSoon = () => { if (!isNative()) return; clearTimeout(notifTimer); notifTimer = setTimeout(scheduleNotifications, 2000); };

  // ---------- haptics, share, status bar ----------
  const haptic = async (kind = 'light') => { const H = plugin('Haptics'); if (!H) return; try { if (kind === 'success') await H.notification({ type: 'SUCCESS' }); else await H.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' }); } catch (e) { /* ignore */ } };
  async function shareFile(name, blob, title) {
    const S = plugin('Share'), fs = plugin('Filesystem');
    if (!S || !fs) return false;
    const buf = await blob.arrayBuffer();
    const w = await fs.writeFile({ path: `share/${name}`, data: b64(buf), directory: 'CACHE', recursive: true });
    await S.share({ title, files: [w.uri] });
    return true;
  }
  // status bar text follows the theme: light text on the burgundy, dark text on the cream
  async function statusBar(dark, bg) { const SB = plugin('StatusBar'); if (!SB) return; try { await SB.setStyle({ style: dark ? 'DARK' : 'LIGHT' }); await SB.setBackgroundColor({ color: bg }); } catch (e) { /* iOS ignores the colour */ } }
  async function boot() {
    if (!isNative()) return;
    await statusBar(L.theme ? L.theme.isDark() : true, L.theme && !L.theme.isDark() ? '#f3efe6' : '#1b090d');
    const LN = plugin('LocalNotifications'); if (LN) LN.addListener('localNotificationActionPerformed', (ev) => { const url = ev.notification && ev.notification.extra && ev.notification.extra.url; if (url) location.hash = url; });
    const App = plugin('App'); if (App) App.addListener('appStateChange', (st) => { if (st.isActive && L.registrar) L.registrar.sweep().then(() => L.render()); });
    const SS = plugin('SplashScreen'); if (SS) { try { await SS.hide(); } catch (e) { /* ignore */ } }
  }

  L.native = { isNative, restore, saveRecord, putMaterial, getMaterial, putFile, getFile, planNotifications, scheduleNotifications, rescheduleSoon, haptic, shareFile, statusBar, boot };
})(window.L);
