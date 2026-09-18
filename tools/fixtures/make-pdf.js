// Writes a small, valid 3-page PDF with real text so the smoke test can exercise the PDF path.
const fs = require('fs'); const path = require('path');
const want = Number((process.argv.find((a) => a.startsWith('--pages=')) || '').split('=')[1] || 0);
const out_name = want ? `book-${want}.pdf` : 'mechanics.pdf';
const TOPICS = ['Kinematics', 'Forces', 'Energy', 'Momentum', 'Rotation', 'Gravitation', 'Oscillations', 'Waves', 'Fluids', 'Thermodynamics', 'Electrostatics', 'Circuits', 'Magnetism', 'Induction', 'Optics', 'Relativity'];
const bigPages = want ? Array.from({ length: want }, (_, i) => {
  if (i === 0) return ['Physics for Everyone', 'A first course in mechanics and beyond.', 'Second edition.', 'Lyceum Press.'];
  if (i === 1) return ['Copyright', 'Copyright 2026 Lyceum Press. All rights reserved.', 'ISBN 978-0-00-000000-0', 'Printed in the United Kingdom.', 'First published 2024.'];
  if (i === 2 || i === 3) return ['Contents', ...Array.from({ length: 14 }, (_, k) => `Chapter ${k + 1 + (i - 2) * 14} ${TOPICS[(k + (i - 2) * 14) % TOPICS.length]} ........ ${10 + k * 10 + (i - 2) * 140}`)];
  if (i >= want - 3) return ['Index', ...Array.from({ length: 22 }, (_, k) => `${TOPICS[k % TOPICS.length].toLowerCase()} term ${k}, ${20 + k * 7}, ${40 + k * 9}`)];
  const ch = Math.floor(i / 10) + 1, topic = TOPICS[(ch - 1) % TOPICS.length];
  const head = i % 10 === 0 ? `Chapter ${ch} ${topic}` : `${ch}.${i % 10} ${topic} in practice`;
  return [head, `${topic} rests on a small set of definitions that the following pages develop in order.`, `The first result relates the quantities defined above and is proved from the axioms alone.`, `A worked example on page ${i + 1} shows the computation step by step with units carried through.`, `Common mistakes include dropping a sign, mixing reference frames and forgetting the normal force.`, `The exercises at the end of the section extend the example to two and three dimensions.`, `Later chapters reuse this idea, so the reader should be able to reproduce the derivation unaided.`];
}) : null;
const pages = bigPages || [
  ['Chapter 1 Kinematics', 'Kinematics describes motion without asking about its causes.', 'Displacement is the change in position of a body; velocity is its rate of change.', 'Acceleration is the rate of change of velocity and points along the change in velocity.', 'Uniform acceleration gives the familiar equations of motion for straight-line travel.', 'A graph of velocity against time has slope equal to the acceleration and area equal to the displacement.'],
  ['Chapter 2 Forces', 'A force is an interaction that changes the motion of a body.', 'Newton\'s second law states that the net force equals mass times acceleration.', 'Newton\'s third law states that forces come in equal and opposite pairs acting on different bodies.', 'Friction opposes relative motion and depends on the normal force between surfaces.', 'Free-body diagrams show every force acting on one chosen body.'],
  ['Chapter 3 Energy', 'Work is force times displacement along the direction of the force.', 'Kinetic energy is one half of the mass times the square of the speed.', 'Potential energy stores work done against a conservative force such as gravity.', 'Mechanical energy is conserved when only conservative forces do work.', 'Power is the rate at which work is done, measured in watts.'],
];
const objs = [];
const add = (s) => { objs.push(s); return objs.length; };
const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
const pageIds = [];
const contentIds = [];
for (const lines of pages) {
  let y = 740;
  const ops = ['BT', '/F1 18 Tf', `72 ${y} Td`, `(${lines[0]}) Tj`, '/F1 12 Tf'];
  for (const ln of lines.slice(1)) { y -= 28; ops.push(`0 -28 Td`, `(${ln.replace(/[()\\]/g, '\\$&')}) Tj`); }
  ops.push('ET');
  const stream = ops.join('\n');
  contentIds.push(add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`));
  pageIds.push(null);
}
const pagesId = objs.length + pages.length + 1;
pageIds.forEach((_, i) => { pageIds[i] = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`); });
add(`<< /Type /Pages /Kids [${pageIds.map((id) => id + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`);
// bookmarks: one per chapter (every 10 pages in the big fixture, every page in the small one), skipping front/back matter
const chapterPages = want ? [4, ...Array.from({ length: Math.floor((want - 4) / 10) - 1 }, (_, k) => 10 + k * 10)] : pages.map((_, i) => i);
const chapterTitle = (pg) => (want && pg === 4 ? `Chapter 1 ${TOPICS[0]}` : pages[pg][0]);
const outlineId = objs.length + 1; const itemIds = chapterPages.map((_, k) => outlineId + 1 + k);
add(`<< /Type /Outlines /First ${itemIds[0]} 0 R /Last ${itemIds[itemIds.length - 1]} 0 R /Count ${itemIds.length} >>`);
chapterPages.forEach((pg, k) => add(`<< /Title (${chapterTitle(pg).replace(/[()\\]/g, '\\$&')}) /Parent ${outlineId} 0 R${k ? ` /Prev ${itemIds[k - 1]} 0 R` : ''}${k + 1 < itemIds.length ? ` /Next ${itemIds[k + 1]} 0 R` : ''} /Dest [${pageIds[pg]} 0 R /XYZ 0 792 0] >>`));
const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R /Outlines ${outlineId} 0 R /PageMode /UseOutlines >>`);
let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
const offsets = [];
objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const xref = Buffer.byteLength(out, 'latin1');
out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
fs.writeFileSync(path.join(__dirname, out_name), Buffer.from(out, 'latin1'));
console.log('wrote tools/fixtures/' + out_name, Buffer.byteLength(out, 'latin1'), 'bytes');
