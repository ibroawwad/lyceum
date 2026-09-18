(function (L) {
  'use strict';
  // Official papers: the registrar's seal, the registration contract, the certificate of completion,
  // a signature pad, and PNG export. Sheets are paper-white regardless of the app theme.

  const esc = L.esc;
  const R = () => L.registrar;
  L.actions = L.actions || {};
  const DAYS_LABEL = (p) => (p.plan.studyDays.length === 7 ? 'every day' : p.plan.studyDays.length === 6 ? 'Monday to Saturday' : 'Monday to Friday');
  const KIND = { quiz: 'Quizzes', pset: 'Problem sets', midterm: 'Midterm examination', final: 'Final examination', project: 'Term project', participation: 'Daily study' };

  // the seal as a group usable inside any SVG (x, y = top-left; s = size in that SVG's units)
  L.SEAL_G = (x, y, s, { year = new Date(L.now()).getFullYear(), text = 'LYCEUM · OFFICE OF THE REGISTRAR · ', id = 'r' } = {}) => {
    const k = s / 200;
    return `<g transform="translate(${x} ${y}) scale(${k})"><defs><path id="seal-ring-${id}" d="M100,100 m-70,0 a70,70 0 1,1 140,0 a70,70 0 1,1 -140,0"/></defs><circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="100" cy="100" r="54" fill="none" stroke="currentColor" stroke-width="1"/><text font-family="Inter, system-ui, sans-serif" font-size="13.5" font-weight="700" letter-spacing="2.2" fill="currentColor"><textPath href="#seal-ring-${id}" startOffset="12">${text}</textPath></text><g transform="translate(74 66) scale(0.82)">${L.MARK_INNER}</g><text x="100" y="135" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="700" letter-spacing="2" fill="currentColor">${year}</text></g>`;
  };

  L.SEAL = (size = 120, opts = {}) => `<svg viewBox="0 0 200 200" width="${size}" height="${size}" class="seal" aria-label="Seal of the Registrar">${L.SEAL_G(0, 0, 200, opts)}</svg>`;

  // ---------- contract ----------
  const contractNo = () => `LYC-C-${new Date(L.now()).getFullYear()}-${String(L.S.courses.filter((c) => c.contract).length + 1).padStart(4, '0')}`;
  // the canonical text that gets hashed; the sheet renders the same facts
  function contractText(p, student, no) {
    const lines = [
      `REGISTRATION CONTRACT ${no}`,
      `Student: ${student.name} (${student.id})`,
      `Course: ${p.code} ${p.title}`,
      `Term: ${p.term.start} to ${p.term.end} (${p.term.weeks} weeks)`,
      `Pace: ${p.plan.paceLabel}, ${p.plan.minutesPerDay} minutes a day, ${DAYS_LABEL(p)}, ${p.plan.hoursPerWeek} hours a week`,
      `Credits: ${p.credits}`,
      `Withdrawal deadline: ${p.policy.withdrawBefore}`,
      `Late policy: -${p.policy.late.perDayPct}% per day for at most ${p.policy.late.maxDays} days; examinations have no late window`,
      `Weights: ${Object.entries(p.policy.weights).map(([k, w]) => `${k} ${w}%`).join(', ')}`,
      `Assessments: ${p.assessments.map((a) => `${a.title} opens ${a.opensAt} due ${a.dueAt}`).join('; ')}`,
    ];
    return lines.join('\n');
  }
  const CLAUSES = [
    'Dates, weights and examinations are fixed at signature.',
    'One attempt per paper, within its window; an unsubmitted paper is a zero.',
    'Every paper is the Student\u2019s own work; the record is permanent; withdrawal only before the deadline above.',
  ];
  function contractSheet(p, student, { no, signedAt, signature, name, forSigning = false } = {}) {
    const date = signedAt ? new Date(signedAt) : new Date(L.now());
    const count = (k) => p.assessments.filter((a) => a.kind === k).length;
    const exam = (k) => { const a = p.assessments.find((x) => x.kind === k); return a ? `${L.fmt.date(a.opensAt)} ${L.fmt.time(a.opensAt)}–${L.fmt.time(a.dueAt)}` : null; };
    const papers = [
      count('quiz') ? `${count('quiz')} quizzes (Fri–Sun, weekly)` : null,
      count('pset') ? `${count('pset')} problem sets (Mon–Sun, fortnightly, late −${p.policy.late.perDayPct}%/day up to ${p.policy.late.maxDays} days)` : null,
      exam('midterm') ? `midterm ${exam('midterm')} (75 min)` : null,
      count('project') ? `term project due ${L.fmt.date(p.assessments.find((a) => a.kind === 'project').dueAt)}` : null,
      `final ${exam('final')} (120 min)`,
    ].filter(Boolean);
    const weights = Object.entries(p.policy.weights).map(([k, w]) => `${(KIND[k] || k).toLowerCase()} ${w}%`).join(' · ');
    return `<article class="sheet contract" id="sheet">
      <header class="sheet-head"><div class="sheet-seal">${L.SEAL(84, { id: 'c' })}</div><div class="sheet-brand"><div class="sheet-name">Lyceum</div><div class="sheet-office">Office of the Registrar</div></div><div class="sheet-no"><div>Contract</div><b>${esc(no || contractNo())}</b><div>${L.fmt.date(date)} ${date.getFullYear()}</div></div></header>
      <h1 class="sheet-title">Registration Contract</h1>
      <p class="sheet-intro"><b>${esc(student.name)}</b> (${esc(student.id)}) enrols in <b>${esc(p.code)} ${esc(p.title)}</b> on the terms below.</p>
      <table class="sheet-table"><tbody>
        <tr><th>Term</th><td>${L.fmt.date(p.term.start)} – ${L.fmt.date(p.term.end)} ${new Date(p.term.end + 'T00:00:00').getFullYear()} · ${p.term.weeks} weeks · ${p.credits} credit${p.credits === 1 ? '' : 's'}</td></tr>
        <tr><th>Pace</th><td>${esc(p.plan.paceLabel)} · ${p.plan.minutesPerDay} min a day, ${DAYS_LABEL(p)}</td></tr>
        <tr><th>Papers</th><td>${papers.map(esc).join('; ')}.</td></tr>
        <tr><th>Weights</th><td>${esc(weights)}</td></tr>
        <tr><th>Withdraw by</th><td>${L.fmt.date(L.date.addDays(L.date.parse(p.policy.withdrawBefore), -1))}</td></tr>
      </tbody></table>
      <ol class="sheet-clauses">${CLAUSES.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
      <div class="sheet-sign">
        <div class="sign-block">
          <div class="sign-label">The Student</div>
          ${forSigning
            ? `<div class="pad-wrap"><canvas id="signature-pad" width="900" height="300" aria-label="Signature"></canvas><button type="button" class="pad-clear" data-act="sig-clear">Clear</button></div>
               <input id="contract-name" class="sign-name" autocomplete="off" placeholder="Type your full name: ${esc(student.name)}" value="">`
            : `<div class="pad-wrap is-signed">${signature ? `<img src="${signature}" alt="Signature of ${esc(name || student.name)}">` : ''}</div><div class="sign-name is-signed">${esc(name || student.name)}</div>`}
          <div class="sign-date">${signedAt ? `Signed ${L.fmt.dt(signedAt)}` : 'Signature and full name'}</div>
        </div>
        <div class="sign-block">
          <div class="sign-label">The Registrar</div>
          <div class="pad-wrap is-registrar">${L.SEAL(100, { id: 'c2' })}<span class="registrar-script">The Registrar</span></div>
          <div class="sign-name is-signed">Office of the Registrar, Lyceum</div>
          <div class="sign-date">${signedAt ? `Countersigned ${L.fmt.dt(signedAt)}` : 'Countersigned on enrolment'}</div>
        </div>
      </div>
    </article>`;
  }

  // ---------- signature pad ----------
  let pad = null;
  function mountPad(root) {
    const canvas = root.querySelector('#signature-pad'); if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1d2a6b';
    let drawing = false, points = 0, last = null;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)]; };
    const down = (e) => { drawing = true; last = pos(e); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); e.preventDefault(); };
    const move = (e) => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; points++; e.preventDefault(); };
    const up = () => { drawing = false; };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', up);
    pad = { canvas, clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); points = 0; }, get points() { return points; }, dataUrl() { return trimmed(canvas); } };
    return pad;
  }
  // crop the drawing to its ink so the stored image is small and sits nicely on the certificate
  function trimmed(canvas) {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const img = ctx.getImageData(0, 0, width, height).data;
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { if (img[(y * width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < x0) return null;
    const pad = 12; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width, x1 + pad); y1 = Math.min(height, y1 + pad);
    const out = document.createElement('canvas'); out.width = x1 - x0; out.height = y1 - y0;
    out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }
  L.actions['sig-clear'] = () => { if (pad) pad.clear(); };

  // ---------- certificate ----------
  const PASS = 70;
  async function issueCertificate(c) {
    if (c.certificate || !c.final || c.final.letter === 'W' || c.final.pct == null || c.final.pct < PASS) return null;
    const year = new Date(L.now()).getFullYear();
    const no = `LYC-${year}-${String(100000 + L.S.courses.filter((x) => x.certificate).length + 1).slice(1)}`;
    const st = R().standing(c);
    const breakdown = st.categories.map((k) => ({ kind: k.kind, weight: k.weight, avg: k.avg == null ? 0 : Math.round(k.avg * 10) / 10 }));
    const issuedAt = new Date(L.now()).toISOString();
    const head = L.S.ledger.length ? L.S.ledger[L.S.ledger.length - 1].hash : '0';
    const hash = await L.sha256([no, L.S.student.id, c.code, c.final.pct, c.final.letter, issuedAt, head].join('|'));
    const code = hash.slice(0, 12).toUpperCase().match(/.{4}/g).join('-');
    c.certificate = { no, issuedAt, letter: c.final.letter, pct: c.final.pct, credits: c.credits, breakdown, hash, code };
    await L.ledger.append('certificate_issued', { courseId: c.id, no, code, letter: c.final.letter, pct: c.final.pct });
    return c.certificate;
  }

  // the certificate is one SVG so it displays, prints and exports identically
  function certificateSvg(c) {
    const cert = c.certificate; const s = L.S.student;
    const W = 1200, H = 800;
    const F = 'font-family="EB Garamond, Georgia, Times New Roman, serif"';
    const S = 'font-family="Inter, Helvetica, Arial, sans-serif"';
    const gold = '#b08d2f', ink = '#161616', dim = '#6b6355', green = '#14532d';
    const line = cert.breakdown.map((b) => `${(KIND[b.kind] || b.kind)} ${b.avg.toFixed(0)}%`).join('  ·  ');
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" class="cert-svg" role="img" aria-label="Certificate of Completion for ${esc(s.name)}">
      <rect width="${W}" height="${H}" fill="#fbfaf6"/>
      <rect x="28" y="28" width="${W - 56}" height="${H - 56}" fill="none" stroke="${gold}" stroke-width="3"/>
      <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="${gold}" stroke-width="1"/>
      <g style="color:${gold}">${L.SEAL_G(W / 2 - 60, 70, 120, { year: new Date(cert.issuedAt).getFullYear(), id: 'cert' })}</g>
      <text x="${W / 2}" y="226" text-anchor="middle" ${S} font-size="12" font-weight="700" letter-spacing="5" fill="${green}">LYCEUM · OFFICE OF THE REGISTRAR</text>
      <text x="${W / 2}" y="286" text-anchor="middle" ${F} font-size="48" fill="${ink}">Certificate of Completion</text>
      <text x="${W / 2}" y="378" text-anchor="middle" ${F} font-size="54" font-style="italic" font-weight="500" fill="${ink}">${esc(s.name)}</text>
      <line x1="320" y1="396" x2="880" y2="396" stroke="${gold}" stroke-width="1"/>
      <text x="${W / 2}" y="446" text-anchor="middle" ${F} font-size="30" font-weight="500" fill="${ink}">${esc(c.title)}</text>
      <text x="${W / 2}" y="474" text-anchor="middle" ${S} font-size="12.5" letter-spacing="2" fill="${dim}">${esc(c.code)} · ${L.fmt.date(c.term.start).toUpperCase()} – ${L.fmt.date(c.term.end).toUpperCase()} ${new Date(c.term.end + 'T00:00:00').getFullYear()} · ${c.credits} CREDIT${c.credits === 1 ? '' : 'S'}</text>
      <text x="${W / 2}" y="560" text-anchor="middle" ${F} font-size="60" font-weight="600" fill="${green}">${esc(cert.letter)}<tspan font-size="22" font-weight="400" fill="${dim}" dx="14" dy="-2">${cert.pct.toFixed(1)}%</tspan></text>
      <text x="${W / 2}" y="600" text-anchor="middle" ${S} font-size="12" letter-spacing="1" fill="${dim}">${esc(line.toUpperCase())}</text>
      ${c.contract && c.contract.signature ? `<image href="${c.contract.signature}" x="190" y="646" width="220" height="60" preserveAspectRatio="xMidYMid meet"/>` : ''}
      <line x1="150" y1="712" x2="450" y2="712" stroke="${ink}" stroke-width="1"/>
      <text x="300" y="730" text-anchor="middle" ${S} font-size="11" letter-spacing="2" fill="${dim}">STUDENT</text>
      <text x="900" y="700" text-anchor="middle" ${F} font-size="26" font-style="italic" fill="${green}">The Registrar</text>
      <line x1="750" y1="712" x2="1050" y2="712" stroke="${ink}" stroke-width="1"/>
      <text x="900" y="730" text-anchor="middle" ${S} font-size="11" letter-spacing="2" fill="${dim}">REGISTRAR</text>
      <text x="${W / 2}" y="760" text-anchor="middle" ${S} font-size="10.5" letter-spacing="1" fill="${dim}">${esc(cert.no)} · ${esc(cert.code)} · ${L.fmt.date(cert.issuedAt).toUpperCase()} ${new Date(cert.issuedAt).getFullYear()}</text>
    </svg>`;
  }

  async function certificatePng(c) {
    const svg = certificateSvg(c);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 1600;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, 2400, 1600); ctx.drawImage(img, 0, 0, 2400, 1600);
      return await new Promise((res) => canvas.toBlob(res, 'image/png'));
    } finally { URL.revokeObjectURL(url); }
  }

  L.papers = { contractNo, contractText, contractSheet, mountPad, get pad() { return pad; }, PASS, issueCertificate, certificateSvg, certificatePng };
})(window.L);
