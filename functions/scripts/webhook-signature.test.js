const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

/**
 * X-Hub-Signature-256 verification tests for the Meta webhook (POST /) and
 * the GET verify-token handshake. Runs the compiled express app standalone
 * on an ephemeral port — no emulator needed.
 *
 * A correct signature on a non-WhatsApp payload reaches the body gate and
 * returns 404 (proving the signature check passed); bad/missing signatures
 * return 403 before any processing.
 */

process.env.WHATSAPP_APP_SECRET = 'smoke-app-secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'smoke-verify-token';

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-webhook' });

const app = require('../lib/webhook').default;

const SECRET = 'smoke-app-secret';
const sign = (body, secret = SECRET) =>
  'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

let server;
let base;

before(async () => {
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server && server.close());

const post = (body, signature) =>
  fetch(`${base}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signature ? { 'x-hub-signature-256': signature } : {}),
    },
    body,
  });

describe('webhook signature verification', () => {
  it('rejects a POST with no signature', async () => {
    const res = await post(JSON.stringify({ object: 'other' }));
    assert.equal(res.status, 403);
  });

  it('rejects a POST with a wrong signature', async () => {
    const body = JSON.stringify({ object: 'other' });
    const res = await post(body, sign(body, 'wrong-secret'));
    assert.equal(res.status, 403);
  });

  it('rejects a POST whose signature does not match the body', async () => {
    const res = await post(JSON.stringify({ object: 'other' }), sign(JSON.stringify({ object: 'whatsapp_business_account' })));
    assert.equal(res.status, 403);
  });

  it('rejects a malformed signature header', async () => {
    const res = await post(JSON.stringify({ object: 'other' }), 'not-a-signature');
    assert.equal(res.status, 403);
  });

  it('passes a correctly signed POST through to payload handling', async () => {
    // object !== 'whatsapp_business_account' → the route's own 404 proves
    // the signature gate accepted the request.
    const body = JSON.stringify({ object: 'other' });
    const res = await post(body, sign(body));
    assert.equal(res.status, 404);
  });
});

describe('webhook Meta verify-token handshake', () => {
  it('accepts the correct verify token', async () => {
    const res = await fetch(`${base}/?hub.mode=subscribe&hub.verify_token=smoke-verify-token&hub.challenge=ch-42`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ch-42');
  });

  it('rejects a wrong verify token', async () => {
    const res = await fetch(`${base}/?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=ch-42`);
    assert.equal(res.status, 403);
  });
});
