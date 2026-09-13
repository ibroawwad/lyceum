// Draws the Lyceum mark (laurel + Doric column) and prints the SVG inner markup.
const P0 = [23, 55], P1 = [6, 46], P2 = [4, 26], P3 = [17, 10]; // left stem (cubic bezier)
const bez = (t) => { const u = 1 - t; return [u*u*u*P0[0] + 3*u*u*t*P1[0] + 3*u*t*t*P2[0] + t*t*t*P3[0], u*u*u*P0[1] + 3*u*u*t*P1[1] + 3*u*t*t*P2[1] + t*t*t*P3[1]]; };
const tan = (t) => { const u = 1 - t; const dx = 3*u*u*(P1[0]-P0[0]) + 6*u*t*(P2[0]-P1[0]) + 3*t*t*(P3[0]-P2[0]); const dy = 3*u*u*(P1[1]-P0[1]) + 6*u*t*(P2[1]-P1[1]) + 3*t*t*(P3[1]-P2[1]); return Math.atan2(dy, dx) * 180 / Math.PI; };
const r = (n) => Math.round(n * 10) / 10;
let leaves = '';
for (let i = 0; i < 8; i++) {
  const t = 0.1 + i * 0.115;
  const [x, y] = bez(t); const a = tan(t);
  const side = i % 2 ? 1 : -1; // alternate inside/outside the stem
  const ang = a + side * 38;
  const ox = Math.cos(ang * Math.PI / 180) * 3.4, oy = Math.sin(ang * Math.PI / 180) * 3.4;
  leaves += `<ellipse cx="${r(x + ox)}" cy="${r(y + oy)}" rx="1.9" ry="4.2" transform="rotate(${r(ang + 90)} ${r(x + ox)} ${r(y + oy)})"/>`;
}
const stem = `<path d="M${P0} C${P1} ${P2} ${P3}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`;
const branch = `<g>${stem}${leaves}</g>`;
const column = `<rect x="23" y="11" width="18" height="3" rx="0.8"/><rect x="25" y="14.5" width="14" height="2"/>` +
  [0,1,2,3,4].map((i) => `<rect x="${r(27 + i * 2.1)}" y="17.5" width="1.6" height="28"/>`).join('') +
  `<rect x="25" y="46" width="14" height="2.2"/><rect x="22" y="48.8" width="20" height="3" rx="0.8"/>`;
const svg = `<g fill="currentColor">${branch}<g transform="matrix(-1 0 0 1 64 0)">${branch}</g>${column}</g>`;
process.stdout.write(svg);
