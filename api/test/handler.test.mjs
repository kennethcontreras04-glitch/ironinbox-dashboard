import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createHandler } from '../src/handler.mjs';

const env = { FRONTEND_URL: 'https://demo.azurestaticapps.net', GMAIL_REDIRECT_URI: 'https://demo.azurestaticapps.net/api/gmail/callback', GOOGLE_CLIENT_ID: 'google', GOOGLE_CLIENT_SECRET: 'test',
  MICROSOFT_CLIENT_ID: 'microsoft', MICROSOFT_CLIENT_SECRET: 'test', MICROSOFT_REDIRECT_URI: 'https://demo.azurestaticapps.net/api/outlook/callback', TOKEN_ENCRYPTION_KEY: 'test-only-secret' };
const hash = value => createHash('sha256').update(value).digest('hex');
const key = createHash('sha256').update(env.TOKEN_ENCRYPTION_KEY).digest();
function encrypted(value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return { encrypted: [iv, cipher.getAuthTag(), data].map(x => x.toString('base64url')).join('.') };
}
function decrypted(record) {
  const [iv, tag, data] = record.value.encrypted.split('.').map(x => Buffer.from(x, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', key, iv); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString());
}
function setup(overrides = {}) {
  const records = new Map(); let version = 0;
  const requests = [];
  const behavior = { expiredToken: false, denied: false, attachmentNext: null };
  const storage = {
    read: async key => structuredClone(records.get(key) || null),
    write: async (key, value, etag) => {
      if (records.get(key)?.etag !== etag) throw Object.assign(new Error('Conflict'), { statusCode: 412 });
      records.set(key, { value, etag: String(++version) });
    },
    remove: async (key, etag) => {
      if (records.get(key)?.etag !== etag) throw Object.assign(new Error('Conflict'), { statusCode: 412 });
      records.delete(key);
    },
  };
  const fetcher = async (url, options = {}) => {
    requests.push({ url, options });
    const subject = options.headers?.Authorization?.replace('Bearer access-', '') || 'google-user';
    const ok = json => ({ ok: true, status: 200, json: async () => json });
    if (url.includes('/token')) {
      const code = options.body.get('code') || options.body.get('refresh_token').replace('refresh-', '');
      return ok({ access_token: `access-${code}`, refresh_token: `refresh-${code}${options.body.get('grant_type') === 'refresh_token' ? '-rotated' : ''}`, expires_in: behavior.expiredToken ? -1 : 3600 });
    }
    if (url.includes('userinfo')) return ok({ sub: subject, email: `${subject}@example.com`, email_verified: true, name: subject });
    if (url.includes('$select=id,mail')) return ok({ id: subject, mail: `${subject}@outlook.com`, displayName: subject });
    if (behavior.denied) return { ok: false, status: 403, json: async () => ({}) };
    if (url.includes('/attachments')) return ok({ value: [{ name: 'invoice.html', contentType: 'text/html', size: 12 }], ...(behavior.attachmentNext ? { '@odata.nextLink': behavior.attachmentNext } : {}) });
    if (url.includes('graph.microsoft.com') && url.includes('/mailFolders/inbox/messages?')) return ok({ value: [{ id: 'one' }] });
    if (url.includes('graph.microsoft.com')) return ok({ id: 'one', conversationId: 'thread', receivedDateTime: '2026-10-12T10:00:00Z',
      from: { emailAddress: { name: 'PayPal Support', address: 'help@paypa1.com' } }, subject: 'Urgent verify your account',
      body: { contentType: 'html', content: '<a href="https://evil.example/login">paypal.com</a>' }, hasAttachments: true });
    if (url.includes('messages?')) return ok({ messages: [{ id: 'one' }] });
    return ok({ id: 'one', internalDate: '1700000000000', payload: { headers: [{ name: 'Subject', value: 'Urgent password verify' }], body: { data: '' } } });
  };
  const settings = { ...env, ...overrides };
  const handler = createHandler({ env: settings, storage, fetcher });
  const request = (path, method = 'GET', cookie = '', body = {}, origin = env.FRONTEND_URL) => handler({ url: `${env.FRONTEND_URL}${path}`, method, headers: new Headers({ cookie, origin, 'content-type': 'application/json' }), json: async () => body });
  async function oauth(provider = 'gmail', intent = 'login', session = '', subject = 'google-user', query = '') {
    const start = await request(intent === 'login' ? `/api/auth/${provider}/start` : `/api/${provider}/connect${query}`, 'GET', session);
    assert.equal(start.status, 302, JSON.stringify(start.jsonBody));
    const state = new URL(start.headers.Location).searchParams.get('state');
    const browser = `ironinbox_oauth=${start.cookies[0].value}`;
    const callback = `/api/${provider}/callback?state=${state}&code=${subject}`;
    const result = await request(callback, 'GET', `${session}; ${browser}`);
    return { start, result, callback, browser, cookie: intent === 'login' ? `ironinbox_session=${result.cookies[0].value}` : session };
  }
  const status = async cookie => (await request('/api/auth/status', 'GET', cookie)).jsonBody;
  const connect = async (cookie, provider = 'gmail', subject = 'google-user', query = '') => {
    const flow = await oauth(provider, 'connect', cookie, subject, query);
    assert.equal(flow.result.headers.Location, `${env.FRONTEND_URL}/account?connected=1`);
    return (await status(cookie)).mailboxes.find(item => item.provider === provider && item.accountEmail.startsWith(subject));
  };
  const sync = (cookie, mailboxId, body = {}) => request('/api/mailboxes/sync', 'POST', cookie, { mailboxId, ...body });
  return { records, storage, fetcher, handler, request, oauth, status, connect, sync, requests, behavior };
}

test('health permits Gmail and password accounts when Microsoft is not configured', async () => {
  const s = setup({ MICROSOFT_CLIENT_ID: '' });
  const health = (await s.request('/api/health')).jsonBody;
  assert.equal(health.configured, true); assert.equal(health.providers.gmail, true); assert.equal(health.providers.outlook, false);
  assert.equal((await s.request('/api/auth/outlook/start')).status, 503);
  assert.equal((await s.oauth()).result.status, 302);
  const handler = createHandler({ env: {}, storage: null });
  const req = path => ({ url: `https://test${path}`, method: 'GET', headers: new Headers() });
  assert.equal((await handler(req('/api/health'))).jsonBody.configured, false);
  assert.equal((await handler(req('/api/auth/gmail/start'))).status, 503);
});

test('login scopes exclude mail access; Microsoft uses common authority and PKCE', async () => {
  const s = setup();
  for (const provider of ['gmail', 'outlook']) {
    const flow = await s.oauth(provider);
    const url = new URL(flow.start.headers.Location);
    assert.doesNotMatch(url.searchParams.get('scope'), /Mail.Read|gmail.readonly/i);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    const tokenRequest = s.requests.findLast(item => item.url.includes('/token'));
    assert.equal(createHash('sha256').update(tokenRequest.options.body.get('code_verifier')).digest('base64url'), url.searchParams.get('code_challenge'));
    assert.equal((await s.status(flow.cookie)).mailboxes.length, 0);
    if (provider === 'outlook') assert.match(url.pathname, /^\/common\//);
  }
});

test('persistent internal identity survives logout and new function instances', async () => {
  const s = setup(); const first = await s.oauth();
  const original = await s.status(first.cookie);
  assert.notEqual(original.uid, 'google-user');
  const mailbox = await s.connect(first.cookie); await s.sync(first.cookie, mailbox.id);
  assert.equal((await s.request('/api/auth/logout', 'POST', first.cookie)).status, 200);
  assert.equal((await s.request('/api/auth/status', 'GET', first.cookie)).status, 401);
  const second = await s.oauth();
  assert.equal((await s.status(second.cookie)).uid, original.uid);
  const fresh = createHandler({ env, storage: s.storage, fetcher: s.fetcher });
  const messages = await fresh({ url: `${env.FRONTEND_URL}/api/emails`, method: 'GET', headers: new Headers({ cookie: second.cookie }) });
  assert.equal(messages.jsonBody.messages.length, 1);
  assert.equal(JSON.stringify([...s.records]).includes('refresh-google-user'), false);
  assert.equal(JSON.stringify([...s.records]).includes('google-user@example.com'), false);
});

test('OAuth state is browser-bound, provider-bound, expiring, and single-use', async () => {
  const s = setup(); const flow = await s.oauth();
  assert.match((await s.request(flow.callback, 'GET', flow.browser)).headers.Location, /auth=error/);
  const start = await s.request('/api/auth/gmail/start'); const state = new URL(start.headers.Location).searchParams.get('state');
  assert.match((await s.request(`/api/gmail/callback?state=${state}&code=x`)).headers.Location, /auth=error/);
  const browser = `ironinbox_oauth=${start.cookies[0].value}`;
  assert.match((await s.request(`/api/outlook/callback?state=${state}&code=x`, 'GET', browser)).headers.Location, /auth=error/);
  const stateKey = `oauth/${hash(state)}`, record = s.records.get(stateKey), value = decrypted(record);
  value.expiresAt = 0; record.value = encrypted(value);
  assert.match((await s.request(`/api/gmail/callback?state=${state}&code=x`, 'GET', browser)).headers.Location, /auth=error/);
});

test('Google login can add Microsoft and multiple Gmail accounts without changing login', async () => {
  const s = setup(); const { cookie } = await s.oauth(); const original = await s.status(cookie);
  const microsoft = await s.connect(cookie, 'outlook', 'secondary');
  const gmail = await s.connect(cookie, 'gmail', 'other');
  await s.connect(cookie, 'gmail', 'third');
  const status = await s.status(cookie);
  assert.equal(status.uid, original.uid); assert.equal(status.email, original.email); assert.equal(status.mailboxes.length, 3);
  assert.equal((await s.sync(cookie, microsoft.id)).jsonBody.messages[0].sourceProvider, 'outlook');
  const messages = (await s.sync(cookie, gmail.id)).jsonBody.messages;
  assert.equal(messages.length, 2); assert.notEqual(messages[0].id, messages[1].id);
  const outlook = messages.find(item => item.sourceProvider === 'outlook');
  assert.ok(outlook.signals.some(signal => signal.detector === 'attachment'));
  assert.ok(outlook.signals.some(signal => signal.detector === 'link-mismatch'));
  assert.equal(outlook.mailboxEmail, 'secondary@outlook.com');
});

test('Microsoft login can monitor only a secondary Gmail mailbox', async () => {
  const s = setup(); const { cookie } = await s.oauth('outlook', 'login', '', 'ms-login');
  const mailbox = await s.connect(cookie, 'gmail', 'gmail-secondary');
  assert.equal((await s.status(cookie)).loginProvider, 'outlook');
  assert.equal((await s.sync(cookie, mailbox.id)).jsonBody.messages[0].sourceProvider, 'gmail');
});

test('connect requires login and is bound to the same session and user', async () => {
  const s = setup(); assert.equal((await s.request('/api/outlook/connect?ownerId=forged')).status, 401);
  const a = await s.oauth(), b = await s.oauth('gmail', 'login', '', 'other-user');
  const start = await s.request('/api/outlook/connect', 'GET', a.cookie);
  const state = new URL(start.headers.Location).searchParams.get('state');
  const response = await s.request(`/api/outlook/callback?state=${state}&code=secondary`, 'GET', `${b.cookie}; ironinbox_oauth=${start.cookies[0].value}`);
  assert.match(response.headers.Location, /connection=error/);
  assert.equal((await s.status(a.cookie)).mailboxes.length, 0); assert.equal((await s.status(b.cookie)).mailboxes.length, 0);
});

test('monitor this account and reconnect cannot attach a different provider identity', async () => {
  const s = setup(); const { cookie } = await s.oauth();
  const wrong = await s.oauth('gmail', 'connect', cookie, 'wrong-user', '?same=1');
  assert.match(wrong.result.headers.Location, /connection=error/);
  const mailbox = await s.connect(cookie, 'gmail', 'google-user', '?same=1');
  const mismatch = await s.oauth('gmail', 'connect', cookie, 'different', `?mailboxId=${mailbox.id}`);
  assert.match(mismatch.result.headers.Location, /connection=error/);
  assert.equal((await s.status(cookie)).mailboxes.length, 1);
});

test('mailbox ownership and cross-site mutation checks reject forged IDs', async () => {
  const s = setup(); const a = await s.oauth(), b = await s.oauth('gmail', 'login', '', 'other-user');
  const mailbox = await s.connect(a.cookie);
  assert.equal((await s.sync(b.cookie, mailbox.id)).status, 404);
  assert.equal((await s.request('/api/mailboxes/disconnect', 'POST', b.cookie, { mailboxId: mailbox.id })).status, 404);
  assert.equal((await s.request('/api/mailboxes/sync', 'POST', a.cookie, { mailboxId: mailbox.id }, 'https://attacker.example')).status, 403);
  assert.equal((await s.request('/api/emails?ownerId=forged')).status, 401);
});

test('pause and disconnect affect only the selected mailbox and preserve login', async () => {
  const s = setup(); const { cookie } = await s.oauth();
  const a = await s.connect(cookie), b = await s.connect(cookie, 'outlook', 'secondary');
  await s.sync(cookie, a.id); await s.sync(cookie, b.id);
  await s.request('/api/mailboxes/monitoring', 'POST', cookie, { mailboxId: a.id, monitoring: false });
  assert.equal((await s.request('/api/emails', 'GET', cookie)).jsonBody.messages.length, 1);
  assert.equal((await s.sync(cookie, a.id)).status, 409);
  await s.request('/api/mailboxes/monitoring', 'POST', cookie, { mailboxId: a.id, monitoring: true });
  assert.equal((await s.request('/api/emails', 'GET', cookie)).jsonBody.messages.length, 2);
  await s.request('/api/mailboxes/disconnect', 'POST', cookie, { mailboxId: a.id });
  assert.equal((await s.status(cookie)).mailboxes.length, 1);
  assert.equal((await s.request('/api/emails', 'GET', cookie)).jsonBody.messages.length, 1);
});

test('reviews retain real reviewer and classification settings across reconnects', async () => {
  const s = setup(); const { cookie } = await s.oauth(); const mailbox = await s.connect(cookie);
  const synced = await s.sync(cookie, mailbox.id, { threshold: 0 }); const id = synced.jsonBody.messages[0].id;
  assert.equal(synced.jsonBody.messages[0].disposition, 'flagged');
  const released = await s.request('/api/emails/disposition', 'POST', cookie, { ids: [id], disposition: 'safe', by: 'forged' });
  assert.equal(released.jsonBody.updated, 1);
  await s.connect(cookie);
  const message = (await s.sync(cookie, mailbox.id, { threshold: 0 })).jsonBody.messages[0];
  assert.equal(message.disposition, 'safe'); assert.equal(message.review.by, 'google-user@example.com');
});

test('concurrent mailbox writes return a retryable conflict', async () => {
  const s = setup(); const { cookie } = await s.oauth(); const mailbox = await s.connect(cookie);
  s.storage.write = async () => { throw Object.assign(new Error('ConditionNotMet'), { statusCode: 412 }); };
  const result = await s.sync(cookie, mailbox.id);
  assert.equal(result.status, 409); assert.match(result.jsonBody.error, /retry/);
});

test('Microsoft refresh tokens rotate and Graph gets immutable IDs without attachment content', async () => {
  const s = setup(); const { cookie } = await s.oauth(); s.behavior.expiredToken = true;
  const mailbox = await s.connect(cookie, 'outlook', 'secondary'); s.behavior.expiredToken = false;
  assert.equal((await s.sync(cookie, mailbox.id)).status, 200);
  assert.ok(s.requests.some(item => item.options.body?.get('grant_type') === 'refresh_token'));
  const owner = [...s.records.entries()].find(([key]) => key.startsWith('users/'))[1];
  assert.equal(decrypted(owner).mailboxes[mailbox.id].refreshToken, 'refresh-secondary-rotated');
  const graph = s.requests.filter(item => item.url.includes('/v1.0/me/'));
  assert.ok(graph.every(item => item.options.headers.Prefer === 'IdType="ImmutableId"'));
  assert.ok(graph.some(item => item.url.includes('/attachments?$select=id,name,contentType,size,isInline')));
  assert.ok(graph.every(item => !item.url.includes('contentBytes')));
});

test('Microsoft permission failure asks for reconnection; pagination cannot leak tokens', async () => {
  const s = setup(); const { cookie } = await s.oauth(); const mailbox = await s.connect(cookie, 'outlook', 'secondary');
  s.behavior.denied = true;
  const denied = await s.sync(cookie, mailbox.id); assert.equal(denied.status, 401); assert.match(denied.jsonBody.error, /Reconnect/);
  s.behavior.denied = false; s.behavior.attachmentNext = 'https://attacker.example/steal';
  assert.equal((await s.sync(cookie, mailbox.id)).status, 502);
  assert.ok(s.requests.every(item => !item.url.startsWith('https://attacker.example')));
});

test('username/password registration, persistence, wrong passwords and throttling', async () => {
  const s = setup(); const body = { username: 'New.User', password: 'a long test password 123' };
  const registered = await s.request('/api/auth/register', 'POST', '', body);
  assert.equal(registered.status, 201); const cookie = `ironinbox_session=${registered.cookies[0].value}`;
  const first = await s.status(cookie); assert.equal(first.loginProvider, 'password'); assert.deepEqual(first.mailboxes, []);
  assert.equal(JSON.stringify([...s.records]).includes(body.password), false);
  await s.request('/api/auth/logout', 'POST', cookie);
  assert.equal((await s.request('/api/auth/password', 'POST', '', { ...body, password: 'wrong password 123' })).status, 401);
  const login = await s.request('/api/auth/password', 'POST', '', { ...body, username: 'new.user' });
  assert.equal(login.status, 200); assert.equal((await s.status(`ironinbox_session=${login.cookies[0].value}`)).uid, first.uid);
  for (let i = 0; i < 7; i++) await s.request('/api/auth/password', 'POST', '', { ...body, password: 'wrong password 123' });
  assert.equal((await s.request('/api/auth/password', 'POST', '', body)).status, 429);
});

test('wipe removes every saved mailbox while preserving the persistent user', async () => {
  const s = setup(); const { cookie } = await s.oauth(); const original = await s.status(cookie); await s.connect(cookie);
  await s.request('/api/data/wipe', 'POST', cookie);
  assert.deepEqual((await s.status(cookie)).mailboxes, []); assert.equal((await s.status(cookie)).uid, original.uid);
});

test('legacy Gmail session migrates tokens and saved messages to a persistent user', async () => {
  const s = setup(); const session = 'legacy-browser';
  await s.storage.write(`sessions/${hash(session)}`, encrypted({ uid: 'google-user', email: 'google-user@example.com', accessToken: 'access-google-user', refreshToken: 'refresh-google-user', tokenExpiresAt: Date.now() + 3600000, expiresAt: Date.now() + 86400000,
    messages: {}, lastSyncedAt: null }));
  const cookie = `ironinbox_session=${session}`, migrated = await s.status(cookie);
  assert.notEqual(migrated.uid, 'google-user'); assert.equal(migrated.mailboxes.length, 1);
  assert.equal((await s.sync(cookie, migrated.mailboxes[0].id)).status, 200);
  const login = await s.oauth(); assert.equal((await s.status(login.cookie)).uid, migrated.uid);
  assert.equal(decrypted(s.records.get(`sessions/${hash(session)}`)).accessToken, undefined);
});

test('prototype names and malformed mailbox IDs cannot select or mutate connections', async () => {
  const s = setup(); const { cookie } = await s.oauth(); await s.connect(cookie);
  for (const mailboxId of ['__proto__', 'constructor', {}, ['__proto__']]) {
    assert.equal((await s.request('/api/mailboxes/monitoring', 'POST', cookie, { mailboxId, monitoring: false })).status, 404);
    assert.equal((await s.request('/api/mailboxes/disconnect', 'POST', cookie, { mailboxId })).status, 404);
  }
  assert.equal(Object.prototype.monitoring, undefined);
  assert.equal((await s.status(cookie)).mailboxes[0].monitoring, true);
});

test('email equality never silently links Google and Microsoft login identities', async () => {
  const s = setup(); const google = await s.oauth('gmail', 'login', '', 'same-subject');
  const microsoft = await s.oauth('outlook', 'login', '', 'same-subject');
  assert.notEqual((await s.status(google.cookie)).uid, (await s.status(microsoft.cookie)).uid);
  await s.connect(google.cookie, 'outlook', 'same-subject');
  assert.equal((await s.status(microsoft.cookie)).mailboxes.length, 0);
});

test('expired browser sessions do not authorize access to persistent mailboxes', async () => {
  const s = setup(); const { cookie } = await s.oauth(); await s.connect(cookie);
  const record = [...s.records.entries()].find(([key]) => key.startsWith('sessions/'))[1];
  const session = decrypted(record); session.expiresAt = 0; record.value = encrypted(session);
  assert.equal((await s.request('/api/emails', 'GET', cookie)).status, 401);
  assert.equal((await s.status((await s.oauth()).cookie)).mailboxes.length, 1);
});

test('invalid Microsoft tenant configuration does not break existing Gmail login', async () => {
  const s = setup({ MICROSOFT_TENANT_ID: '../invalid' });
  assert.equal((await s.request('/api/health')).jsonBody.providers.outlook, false);
  assert.equal((await s.oauth()).result.status, 302);
});
