// Store receipt verification. Each provider is optional: unset credentials → 501 so the app can say so.
const crypto = require('crypto');

async function apple({ receipt, productId }) {
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
  const saRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON, pkg = process.env.ANDROID_PACKAGE;
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

module.exports = { apple, google };
