import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.mjs';

const env = { FRONTEND_URL: 'https://demo.azurestaticapps.net', GMAIL_REDIRECT_URI: 'https://demo.azurestaticapps.net/api/gmail/callback', GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test', TOKEN_ENCRYPTION_KEY: 'test-only-secret' };
function setup() {
  const records = new Map();
  let version = 0;
  const storage = {
    read: async key => structuredClone(records.get(key) || null),
    write: async (key, value, etag) => {
      assert.equal(records.get(key)?.etag, etag);
      records.set(key, { value, etag: String(++version) });
    },
    remove: async (key, etag) => { assert.equal(records.get(key)?.etag, etag); records.delete(key); },
  };
  const fetcher = async url => ({ ok: true, json: async () => url.includes('/token')
    ? { access_token: 'secret-access-token', refresh_token: 'secret-refresh-token', expires_in: 3600 }
    : url.includes('userinfo') ? { sub: 'google-user', email: 'test@example.com', email_verified: true }
    : url.includes('messages?') ? { messages: [{ id: 'one' }] }
    : { id: 'one', internalDate: '1700000000000', payload: { headers: [{ name: 'Subject', value: 'Urgent password verify' }], body: { data: '' } } } });
  const handler = createHandler({ env, storage, fetcher });
  const request = (path, method = 'GET', cookie = '', origin = env.FRONTEND_URL, body = {}) => handler({ url: `${env.FRONTEND_URL}${path}`, method, headers: new Headers({ cookie, origin, 'content-type': 'application/json' }), json: async () => body });
  return { records, storage, fetcher, handler, request };
}
async function login(s) {
  const start = await s.request('/api/gmail/connect?ownerId=attacker');
  const state = new URL(start.headers.Location).searchParams.get('state');
  const browser = `ironinbox_oauth=${start.cookies[0].value}`;
  const callback = `/api/gmail/callback?state=${state}&code=test`;
  const result = await s.request(callback, 'GET', browser);
  assert.equal(result.status, 302);
  assert.equal(result.headers.Location, `${env.FRONTEND_URL}/login`);
  assert.equal(result.cookies[0].httpOnly, true);
  assert.equal(result.cookies[0].secure, true);
  return { cookie: `ironinbox_session=${result.cookies[0].value}`, callback, browser };
}
test('health reports missing configuration and rejects unconfigured API', async () => {
  const handler = createHandler({ env: {}, storage: null });
  const req = path => ({ url: `https://test${path}`, method: 'GET', headers: new Headers() });
  assert.equal((await handler(req('/api/health'))).jsonBody.configured, false);
  assert.equal((await handler(req('/api/gmail/connect'))).status, 503);
});
test('session survives function instances; OAuth is single-use and data is encrypted', async () => {
  const s = setup();
  const { cookie, callback, browser } = await login(s);
  const fresh = createHandler({ env, storage: s.storage, fetcher: s.fetcher });
  const status = await fresh({ url: `${env.FRONTEND_URL}/api/gmail/status`, method: 'GET', headers: new Headers({ cookie }) });
  assert.equal(status.jsonBody.uid, 'google-user');
  assert.match((await s.request(callback, 'GET', browser)).headers.Location, /gmail=error/);
  assert.equal(JSON.stringify([...s.records]).includes('secret-refresh-token'), false);
  assert.equal(JSON.stringify([...s.records]).includes('test@example.com'), false);
});
test('rejects forged owner IDs and cross-site mutations', async () => {
  const s = setup();
  assert.equal((await s.request('/api/emails?ownerId=google-user')).status, 401);
  const { cookie } = await login(s);
  assert.equal((await s.request('/api/gmail/sync', 'POST', cookie, 'https://attacker.example')).status, 403);
});
test('sync returns classified mail; disconnect invalidates access', async () => {
  const s = setup();
  const { cookie } = await login(s);
  const result = await s.request('/api/gmail/sync', 'POST', cookie);
  assert.equal(result.status, 200);
  assert.equal(result.jsonBody.messages[0].id, 'one');
  assert.equal((await s.request('/api/gmail/disconnect', 'POST', cookie)).status, 200);
  assert.equal((await s.request('/api/emails', 'GET', cookie)).status, 401);
});
test('OAuth callback must come from the browser that started it', async () => {
  const s = setup();
  const start = await s.request('/api/gmail/connect');
  const state = new URL(start.headers.Location).searchParams.get('state');
  const result = await s.request(`/api/gmail/callback?state=${state}&code=test`);
  assert.match(result.headers.Location, /gmail=error/);
  assert.equal([...s.records.keys()].some(x => x.startsWith('sessions/')), false);
});
test('expired OAuth state cannot create a session', async () => {
  const s = setup();
  const start = await s.request('/api/gmail/connect');
  const state = new URL(start.headers.Location).searchParams.get('state');
  for (const record of s.records.values()) record.value.expiresAt = 0;
  const result = await s.request(`/api/gmail/callback?state=${state}&code=test`, 'GET', `ironinbox_oauth=${start.cookies[0].value}`);
  assert.match(result.headers.Location, /gmail=error/);
  assert.equal([...s.records.keys()].some(x => x.startsWith('sessions/')), false);
});
test('concurrent mailbox changes return a retryable conflict', async () => {
  const s = setup();
  const { cookie } = await login(s);
  s.storage.write = async () => { throw Object.assign(new Error('ConditionNotMet'), { statusCode: 412 }); };
  const result = await s.request('/api/gmail/sync', 'POST', cookie);
  assert.equal(result.status, 409);
  assert.match(result.jsonBody.error, /retry/);
});
test('saves detection settings per user and wipe deletes them', async () => {
  const s = setup();
  const { cookie } = await login(s);
  const payload = {
    keywords: [{ id: '1', value: 'wire-transfer', createdAt: '2026-01-01', enabled: true }],
    detectionOptions: { caseInsensitive: false, matchInSubject: true, matchInBody: false, wholeWordOnly: true },
    detectionActions: { flagEmail: false, logMatch: true, showInDashboard: false },
    riskThreshold: 40,
    incidents: [{ id: 'INC-2026-AAA', createdTime: 'now', reporter: 'a', subject: 'phishing', priority: 'High', status: 'Open', dueDate: 'Tomorrow', description: 'd' }],
  };
  const saved = await s.request('/api/workspace', 'POST', cookie, env.FRONTEND_URL, payload);
  assert.equal(saved.status, 200);
  assert.equal(saved.jsonBody.keywords[0].value, 'wire-transfer');
  assert.equal(saved.jsonBody.detectionActions.flagEmail, false);
  assert.equal(saved.jsonBody.riskThreshold, 40);
  assert.equal((await s.request('/api/workspace', 'POST', cookie, env.FRONTEND_URL, { riskThreshold: 'nope' })).status, 400);
  await s.request('/api/auth/logout', 'POST', cookie);
  const again = await login(s);
  const restored = await s.request('/api/workspace', 'GET', again.cookie);
  assert.equal(restored.jsonBody.saved, true);
  assert.equal(restored.jsonBody.keywords[0].value, 'wire-transfer');
  assert.equal(restored.jsonBody.incidents[0].id, 'INC-2026-AAA');
  assert.equal(JSON.stringify([...s.records]).includes('wire-transfer'), false);
  await s.request('/api/data/wipe', 'POST', again.cookie);
  const third = await login(s);
  const empty = await s.request('/api/workspace', 'GET', third.cookie);
  assert.equal(empty.jsonBody.saved, false);
});
test('classification settings and reviews survive subsequent syncs', async () => {
  const s = setup();
  const { cookie } = await login(s);
  const sync = body => s.request('/api/gmail/sync', 'POST', cookie, env.FRONTEND_URL, body);
  assert.equal((await sync({ threshold: 0 })).jsonBody.messages[0].disposition, 'flagged');
  const released = await s.request('/api/emails/disposition', 'POST', cookie, env.FRONTEND_URL, {
    ids: ['one'], disposition: 'safe', ownerId: 'someone-else', by: 'forged-reviewer',
  });
  assert.equal(released.jsonBody.updated, 1);
  const message = (await sync({ threshold: 0 })).jsonBody.messages[0];
  assert.equal(message.disposition, 'safe');
  assert.equal(message.review.by, 'test@example.com');
});
