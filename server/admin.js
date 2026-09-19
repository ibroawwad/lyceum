// Operator CLI, run on the box:  node admin.js add "Jane Doe"   → prints the instructor key once
const cohorts = require('./cohorts');
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'add' && rest.length) { const r = cohorts.addInstructor(rest.join(' ')); console.log(`instructor ${r.id} · ${r.name}\nkey: ${r.key}\n(shown once; enter it in the app under More → Instructor)`); }
else if (cmd === 'list') { const db = require('./db'); for (const r of db.prepare('SELECT id, name, created_at FROM instructors').all()) console.log(r.id, r.name, r.created_at); }
else console.log('usage: node admin.js add "Name" | list');
