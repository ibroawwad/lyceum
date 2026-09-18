// Store receipt verification. Each provider is optional: unset credentials → 501 so the app can say so.
const crypto = require('crypto');

const fs = require('fs');
const path = require('path');
const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.lyceum.app';

// StoreKit 2: the purchase arrives as a JWS signed by Apple. The x5c chain is checked down to Apple Root CA - G3
// (fetched once from apple.com over TLS, cached beside the database, optionally pinned by fingerprint), then the
// ES256 signature, then the claims. No shared secret and no deprecated verifyReceipt call.
const ROOT_URL = 'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer';
const ROOT_FILE = path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, 'data', 'x')), 'AppleRootCA-G3.cer');
let appleRoot = null;
async function loadAppleRoot() {
  if (appleRoot) return appleRoot;
  let der = null;
  if (fs.existsSync(ROOT_FILE)) der = fs.readFileSync(ROOT_FILE);
  else { const r = await fetch(ROOT_URL); if (!r.ok) throw new Error(`apple root ${r.status}`); der = Buffer.from(await r.arrayBuffer()); }
  const cert = new crypto.X509Certificate(der);
  if (!/CN=Apple Root CA - G3/.test(cert.subject) || !cert.checkIssued(cert) || !cert.verify(cert.publicKey)) throw new Error('apple root: unexpected certificate');
  const pin = (process.env.APPLE_ROOT_FINGERPRINT || '63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179').replace(/[^0-9A-F]/gi, '').toUpperCase();
  if (pin && pin !== cert.fingerprint256.replace(/:/g, '')) throw new Error('apple root: fingerprint mismatch');
  if (!fs.existsSync(ROOT_FILE)) { try { fs.mkdirSync(path.dirname(ROOT_FILE), { recursive: true }); fs.writeFileSync(ROOT_FILE, der); } catch (e) { /* cache only */ } }
  appleRoot = cert; return cert;
}
const b64u = (s) => Buffer.from(s, 'base64url').toString('utf8');
async function appleJws({ jws, productId }) {
  const parts = String(jws).split('.'); if (parts.length !== 3) return { ok: false, status: 402, error: 'Malformed Apple transaction.' };
  let header, claims;
  try { header = JSON.parse(b64u(parts[0])); claims = JSON.parse(b64u(parts[1])); } catch (e) { return { ok: false, status: 402, error: 'Malformed Apple transaction.' }; }
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 2) return { ok: false, status: 402, error: 'Unsupported Apple transaction.' };
  let chain;
  try { chain = header.x5c.map((c) => new crypto.X509Certificate(Buffer.from(c, 'base64'))); } catch (e) { return { ok: false, status: 402, error: 'Apple transaction: bad certificates.' }; }
  try {
    const root = await loadAppleRoot();
    const last = chain[chain.length - 1];
    if (last.fingerprint256 !== root.fingerprint256) chain.push(root);
    for (let i = 0; i < chain.length - 1; i++) if (!chain[i].checkIssued(chain[i + 1]) || !chain[i].verify(chain[i + 1].publicKey)) return { ok: false, status: 402, error: 'Apple transaction: bad certificate chain.' };
    const now = Date.now(); const leaf = chain[0];
    if (now < new Date(leaf.validFrom).getTime() || now > new Date(leaf.validTo).getTime()) return { ok: false, status: 402, error: 'Apple transaction: certificate expired.' };
    const ok = crypto.verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
    if (!ok) return { ok: false, status: 402, error: 'Apple transaction: bad signature.' };
  } catch (e) { return { ok: false, status: 502, error: `Apple transaction could not be checked (${e.message}).` }; }
  if (claims.bundleId !== BUNDLE_ID) return { ok: false, status: 402, error: 'Apple transaction is for another app.' };
  if (claims.productId !== productId) return { ok: false, status: 402, error: 'No purchase of this product in the transaction.' };
  if (claims.revocationDate) return { ok: false, status: 402, error: 'This purchase was refunded.' };
  if (!claims.transactionId) return { ok: false, status: 402, error: 'Apple transaction has no id.' };
  return { ok: true, tx: 'ios:' + claims.transactionId, sandbox: claims.environment === 'Sandbox' };
}

// legacy app receipt (verifyReceipt) when only that is available; needs the app-specific shared secret
async function apple({ receipt, jws, productId }) {
  if (jws) return appleJws({ jws, productId });
  const secret = process.env.APPLE_SHARED_SECRET;
  if (!secret) return { ok: false, status: 501, error: 'Apple verification is not configured.' };
  const verify = async (host) => { const r = await fetch(`https://${host}/verifyReceipt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ 'receipt-data': receipt, password: secret, 'exclude-old-transactions': true }) }); return r.json(); };
  let j = await verify('buy.itunes.apple.com');
  if (j.status === 21007) j = await verify('sandbox.itunes.apple.com'); // sandbox receipt sent to production
  if (j.status !== 0) return { ok: false, status: 402, error: `Apple rejected the receipt (${j.status}).` };
  const items = [...(j.receipt && j.receipt.in_app || []), ...(j.latest_receipt_info || [])];
  const hit = items.find((i) => i.product_id === productId);
  if (!hit) return { ok: false, status: 402, error: 'No purchase of this product in the receipt.' };
  return { ok: true, tx: 'ios:' + hit.transaction_id, sandbox: j.environment === 'Sandbox' };
}

// Google Play: service-account JWT → access token → purchases.products.get
function googleJwt(sa) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'RS256', typ: 'JWT' });
  const claim = enc({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${claim}`), sa.private_key).toString('base64url');
  return `${head}.${claim}.${sig}`;
}
async function google({ purchaseToken, productId }) {
  const saRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON, pkg = process.env.ANDROID_PACKAGE || 'com.lyceum.app';
  if (!saRaw || !pkg) return { ok: false, status: 501, error: 'Google Play verification is not configured.' };
  const sa = JSON.parse(saRaw);
  const tok = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${googleJwt(sa)}` }).then((r) => r.json());
  if (!tok.access_token) return { ok: false, status: 502, error: 'Could not reach Google Play.' };
  const r = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/products/${productId}/tokens/${purchaseToken}`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  if (!r.ok) return { ok: false, status: 402, error: `Google Play rejected the purchase (${r.status}).` };
  const j = await r.json();
  if (j.purchaseState !== 0) return { ok: false, status: 402, error: 'Purchase is not completed.' };
  return { ok: true, tx: 'android:' + (j.orderId || purchaseToken.slice(0, 32)) };
}

module.exports = { apple, google, loadAppleRoot };
