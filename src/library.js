(function (L) {
  'use strict';
  // The Library: open-access titles served by the Lyceum server as compact packs. Needs More → Lyceum server.
  const base = () => L.faculty.apiBase();
  let cat = null;
  async function catalogue() {
    if (cat) return cat;
    if (!base()) throw new Error('The Library needs the Lyceum server. Set it under More.');
    const r = await fetch(base() + '/v1/library'); if (!r.ok) throw new Error('The Library is not reachable right now.');
    cat = (await r.json()).titles || []; return cat;
  }
  const title = async (id) => (await catalogue()).find((t) => t.id === id) || null;
  async function pack(id, progress = () => {}) {
    progress('Downloading the text…');
    const r = await fetch(base() + `/v1/library/${id}/pack`); if (!r.ok) throw new Error(`Could not fetch this title (${r.status}).`);
    return r.json();
  }
  // original pages for a library course: a small PDF slice, cached on the device
  async function pageSlice(id, from, to) {
    const key = `lib:${id}:${from}-${to}`;
    const hit = await L.db.getFile(key); if (hit && hit.bytes) return hit.bytes;
    const r = await fetch(base() + `/v1/library/${id}/pages/${from}-${to}`); if (!r.ok) throw new Error('Pages unavailable.');
    const bytes = await r.arrayBuffer();
    L.db.putFile(key, { kind: 'pdf', name: `${id} pp. ${from}-${to}`, bytes: bytes.slice(0) }).catch(() => null);
    return bytes;
  }
  L.library = { catalogue, title, pack, pageSlice };

  L.views.library = {
    title: 'Library',
    render() {
      return `<div class="page"><div class="page-head is-row"><div><h1 class="display">Library</h1><p class="lede">Open-access books, ready to become courses.</p></div></div><div id="library-body"><p class="muted small">Loading the catalogue…</p></div></div>`;
    },
    async mount(root) {
      const host = root.querySelector('#library-body'); if (!host) return;
      let titles;
      try { titles = await catalogue(); } catch (e) { host.innerHTML = `<div class="empty"><h2>Library unavailable.</h2><p>${L.esc(e.message)}</p>${base() ? '' : '<p><a class="btn mt-2" href="#/settings">Open More</a></p>'}</div>`; return; }
      const groups = L.groupBy(titles, 'subject');
      host.innerHTML = Object.keys(groups).sort().map((subj) => `<div class="section"><div class="section-head"><h2>${L.esc(subj)}</h2></div><div class="stack gap-2 stagger">${groups[subj].map((t) => `<div class="card"><div class="card-body cols" style="justify-content:space-between;align-items:flex-start"><div style="min-width:0;flex:1"><div style="font-weight:600">${L.esc(t.title)}</div><div class="small muted">${L.esc(t.author)} · ${L.esc(t.level)} · ${L.esc(t.license)}</div></div><a class="btn btn-sm btn-primary" href="#/enrol?lib=${L.esc(t.id)}">Plan course</a></div></div>`).join('')}</div></div>`).join('') + `<p class="small muted mt-3">Titles are used under their stated licences; attribution appears on the prospectus and the certificate.</p>`;
    },
  };
})(window.L);
