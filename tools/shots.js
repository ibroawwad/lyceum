// Store screenshots, straight from the app at exact device pixel sizes. Run after tools/build.js:
//   node tools/shots.js            → store/screenshots/<size>/NN-name.png + store/feature-graphic.png
// Everything is offline (network blocked), the sample course is enrolled, the clock is moved into week 2 and
// the first days are ticked so the tiles, standing and calendar show a course in progress.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const root = path.join(__dirname, '..');
const file = 'file://' + path.join(root, 'dist', 'index.html');
const out = path.join(root, 'store', 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const local = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

// App Store: 6.9" (1320×2868) is required, 6.5" (1284×2778) optional; Play: any 16:9-ish phone size, 1080×1920 is safe
const SIZES = [
  { dir: 'ios-6.9', width: 440, height: 956, scale: 3 },
  { dir: 'ios-6.5', width: 428, height: 926, scale: 3 },
  { dir: 'android-phone', width: 360, height: 640, scale: 3 },
];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const size of SIZES) {
    const dir = path.join(out, size.dir); fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.scale, isMobile: true, hasTouch: true, userAgent: UA, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark' });
    await ctx.route(/^https?:\/\//, (r) => r.abort());
    const page = await ctx.newPage();
    // toasts from the enrolment are still fading and the debug-clock notice is not part of the product
    const shot = async (name) => { await page.evaluate(() => { document.querySelectorAll('.toast').forEach((t) => t.remove()); document.querySelectorAll('.notice').forEach((n) => { if (/registrar clock/.test(n.textContent)) n.remove(); }); }); await page.screenshot({ path: path.join(dir, name + '.png') }); };
    const go = async (hash, sel, ms = 400) => { await page.goto(file + '?debug=1' + hash); if (sel) await page.waitForSelector(sel, { timeout: 60000 }); await sleep(ms); };

    await go('#/welcome', '#student-name');
    await page.fill('#student-name', 'Ada Lovelace');
    await page.tap('[data-act=matriculate]');
    await page.waitForSelector('.empty', { timeout: 5000 });
    await go('#/enrol?sample=1', '.paces');
    await shot('05-paces');
    await page.tap('[data-act=choose-pace][data-pace=standard]');
    await page.waitForSelector('.prospectus', { timeout: 10000 });
    await shot('06-prospectus');
    await page.tap('[data-act=enrol-confirm]');
    await page.waitForSelector('#signature-pad', { timeout: 10000 });
    await page.locator('#signature-pad').scrollIntoViewIfNeeded(); await sleep(200);
    const box = await page.locator('#signature-pad').boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6); await page.mouse.down();
    for (let i = 1; i <= 24; i++) await page.mouse.move(box.x + box.width * (0.2 + i * 0.025), box.y + box.height * (0.6 + Math.sin(i / 2) * 0.25));
    await page.mouse.up();
    await page.fill('#contract-name', 'Ada Lovelace');
    await page.click('[data-act=sign-enrol]');
    try { await page.waitForSelector('.tiles-wrap', { timeout: 20000 }); } catch (e) { console.error('enrol failed:', await page.evaluate(() => (document.querySelector('#contract-error') || document.body).innerText.slice(0, 300))); throw e; }

    // to the Friday of week 1 with the first days done, so every screen shows a course in motion and the quiz is open
    const c = await page.evaluate(() => L.S.courses[0]);
    const s8 = c.sessions[Math.min(4, c.sessions.length - 1)];
    await page.evaluate((cut) => {
      const c = L.S.courses[0];
      for (const s of c.sessions) if (s.date < cut) for (const k of s.chunks) { k.done = true; k.doneAt = s.date + 'T20:00:00'; }
      L.saveNow();
    }, s8.date);
    await page.evaluate((iso) => L.clock.setOffset(new Date(iso).getTime() - Date.now()), `${s8.date}T${String(Math.floor(s8.start / 60)).padStart(2, '0')}:${String(s8.start % 60).padStart(2, '0')}:00`);
    await page.evaluate(async () => { await L.registrar.sweep(); });
    await go('#/today', '.study-block'); await shot('01-today');
    await go(`#/course/${c.id}/day/${s8.date}`, '.page'); await shot('02-day');
    await go(`#/course/${c.id}?tab=plan`, '.tiles-wrap'); await shot('03-course');
    await go('#/courses', '.course-card'); await shot('03b-courses');
    await go('#/calendar', '.page'); await shot('04-calendar');
    await go('#/stats', '.page'); await shot('07-stats');
    const quiz = c.assessments.find((a) => a.kind === 'quiz');
    await go(`#/assess/${c.id}/${quiz.id}`, '.page'); await shot('08-assessment');
    await ctx.close();
    console.log(`${size.dir}: ${fs.readdirSync(dir).length} screenshots at ${size.width * size.scale}×${size.height * size.scale}`);
  }

  // Play feature graphic 1024×500: the mark, the name, one line
  const icon = fs.readFileSync(path.join(root, 'src', 'icon-512.png')).toString('base64');
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(`<html><body style="margin:0;width:1024px;height:500px;background:#1b090d;display:flex;align-items:center;justify-content:center;gap:44px;font-family:Inter,-apple-system,system-ui,sans-serif;color:#f4ecdf">
    <img src="data:image/png;base64,${icon}" style="width:220px;height:220px;border-radius:22%">
    <div><div style="font-size:64px;font-weight:700;letter-spacing:-0.02em">Lyceum</div><div style="font-size:26px;color:#c9b6ad;margin-top:8px;max-width:520px;line-height:1.3">Any study material becomes a real course: a fixed term, daily blocks, graded papers, a certificate.</div></div>
  </body></html>`);
  await page.screenshot({ path: path.join(root, 'store', 'feature-graphic.png') });
  await ctx.close();
  await browser.close();
  console.log('store/feature-graphic.png 1024×500');
})().catch((e) => { console.error(e); process.exit(1); });
