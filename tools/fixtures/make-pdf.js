// Writes a small, valid 3-page PDF with real text so the smoke test can exercise the PDF path.
const fs = require('fs'); const path = require('path');
const pages = [
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
const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
const offsets = [];
objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const xref = Buffer.byteLength(out, 'latin1');
out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
fs.writeFileSync(path.join(__dirname, 'mechanics.pdf'), Buffer.from(out, 'latin1'));
console.log('wrote tools/fixtures/mechanics.pdf', Buffer.byteLength(out, 'latin1'), 'bytes');
