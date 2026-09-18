(function (L) {
  'use strict';
  // Purchases. The store apps sell one consumable product, a course enrolment, bought once per course at the
  // moment of signing. The receipt goes to the Lyceum server, which mints a device-bound entitlement token for
  // that course (faculty papers and grading through the proxy, a registered certificate). The web build charges
  // nothing: it keeps the offline examiner and the student's own key.
  const PRODUCT = 'com.lyceum.app.course';
  const plugin = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativePurchases) || null;
  const base = () => (L.S?.settings?.apiBase || L.API_BASE || '').trim().replace(/\/$/, '');
  const devSecret = () => (L.S?.settings?.iapDevSecret || '').trim();
  const platform = () => (window.Capacitor && window.Capacitor.getPlatform ? window.Capacitor.getPlatform() : 'web');
  const iso = () => new Date(L.now()).toISOString();

  // a stable random id for this installation; every entitlement is bound to it
  function deviceId() {
    if (!L.S.device) { L.S.device = 'd' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10); L.save(); }
    return L.S.device;
  }
  const courseHash = (p) => L.sha256([p.code, p.title, p.plan.pace, p.term.start, (p.material && p.material.hash) || '', deviceId()].join('|'));

  // enrolment is paid inside the native apps when the server issues entitlements and is not running the free
  // pilot; a developer secret (debug settings) exercises the same path on the web against a test server
  function required() {
    if (!base()) return false;
    if (devSecret()) return true;
    if (!L.native.isNative() || !plugin()) return false;
    const h = L.serverHealth;
    return !!(h && h.ok && h.entitlements && !h.free);
  }
  const pending = () => (Array.isArray(L.S.pendingPurchases) ? L.S.pendingPurchases : []);

  // the store's own name and price for the product; App Review requires that these are shown, not hard-coded
  let product = null;
  async function price() {
    if (devSecret() && !plugin()) return { title: 'Course enrolment (test)', priceString: 'TEST' };
    if (product) return product;
    const NP = plugin(); if (!NP) return null;
    try { const r = await NP.getProducts({ productIdentifiers: [PRODUCT], productType: 'inapp' }); product = (r.products || [])[0] || null; } catch (e) { console.error('products', e); product = null; }
    return product;
  }

  async function verify(body) {
    let r;
    try { r = await fetch(base() + '/v1/iap/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { const err = new Error('The Lyceum server could not be reached.'); err.offline = true; throw err; }
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok) { const err = new Error((j && j.error) || `The server answered ${r.status}.`); err.status = r.status; throw err; }
    return j;
  }

  // one purchase → one entitlement. A purchase that never reached the server is kept on the device and settled
  // on the next attempt (any course: the server has not seen it), so nobody is ever charged twice.
  async function buy(p) {
    const ch = await courseHash(p); const device = deviceId();
    const held = pending().find((x) => x.courseHash === ch) || pending()[0];
    if (held) { held.courseHash = ch; held.device = device; L.saveNow(); return settle(held); }
    if (devSecret()) return settle({ platform: 'dev', productId: PRODUCT, courseHash: ch, device, at: iso() });
    const NP = plugin(); if (!NP) throw new Error('Course enrolments are bought inside the Lyceum app.');
    const sup = await NP.isBillingSupported().catch(() => ({ isBillingSupported: false }));
    if (!sup.isBillingSupported) throw new Error('This device cannot make purchases.');
    let t;
    try { t = await NP.purchaseProduct({ productIdentifier: PRODUCT, productType: 'inapp', quantity: 1, isConsumable: true }); }
    catch (e) { const m = String(e && e.message || e); throw new Error(/cancel/i.test(m) ? 'The purchase was cancelled. Nothing was charged.' : `The purchase did not go through: ${m}`); }
    const entry = { platform: platform(), productId: PRODUCT, courseHash: ch, device, tx: t.transactionId || null, receipt: t.receipt || null, jws: t.jwsRepresentation || null, purchaseToken: t.purchaseToken || null, at: iso() };
    L.S.pendingPurchases = [...pending(), entry]; L.saveNow();
    return settle(entry);
  }
  async function settle(entry) {
    const body = Object.assign({}, entry); if (entry.platform === 'dev') body.secret = devSecret();
    let r;
    try { r = await verify(body); }
    catch (e) {
      if (entry.platform !== 'dev' && (e.offline || e.status >= 500)) { e.message = 'Your purchase is safe on this device, but the Lyceum server could not confirm it. Connect to the internet and tap Sign and enrol again; you will not be charged twice.'; }
      throw e;
    }
    L.S.pendingPurchases = pending().filter((x) => x.courseHash !== entry.courseHash); L.saveNow();
    return { token: r.token, tx: entry.tx || null, platform: entry.platform, productId: entry.productId, courseHash: entry.courseHash, sandbox: !!r.sandbox, at: iso() };
  }

  L.store = { PRODUCT, required, price, buy, deviceId, courseHash, pending };
})(window.L);
