import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.mjs';

const env = {
  FRONTEND_URL: 'https://demo.azurestaticapps.net',
  SUPABASE_URL: 'https://example.supabase.co',
  GMAIL_REDIRECT_URI:
    'https://demo.azurestaticapps.net/api/gmail/callback',
  GOOGLE_CLIENT_ID: 'google-test-client',
  GOOGLE_CLIENT_SECRET: 'google-test-secret',
  TOKEN_ENCRYPTION_KEY: 'test-only-secret',
};

function setup() {
  const records = new Map();

  const storage = {
    async read(key) {
      const value = records.get(key);
      return value
        ? { value: structuredClone(value), etag: '1' }
        : null;
    },

    async write(key, value) {
      records.set(key, structuredClone(value));
    },

    async remove(key) {
      records.delete(key);
    },
  };

  const verifyUser = async (request) => {
    if (request.headers.get('authorization') !== 'Bearer test-token') {
      throw Object.assign(
        new Error('Authentication required.'),
        { status: 401 }
      );
    }

    return {
      uid: 'supabase-test-user',
      email: 'test@example.com',
    };
  };

  const fetcher = async (url) => {
  const endpoint = String(url);


  if (endpoint.includes('oauth2.googleapis.com/token')) {
    return new Response(JSON.stringify({
      access_token: 'mock-google-access-token',
      refresh_token: 'mock-google-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

 
if (endpoint.includes('googleapis.com/oauth2/v3/userinfo')) {
  return new Response(JSON.stringify({
    sub: 'google-user-123',
    email: 'gmail-test@example.com',
    email_verified: true,
    name: 'Gmail Test User',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}


  throw new Error(`Unexpected Google request: ${endpoint}`);
};

  const handler = createHandler({
  env,
  storage,
  fetcher,
  verifyUser,
});

  const request = (
  path,
  method = 'GET',
  authenticated = true,
  browserCookie = ''
) => handler({
  url: `${env.FRONTEND_URL}${path}`,
  method,
  headers: new Headers({
    origin: env.FRONTEND_URL,
    'content-type': 'application/json',
    ...(authenticated
      ? { authorization: 'Bearer test-token' }
      : {}),
    ...(browserCookie
      ? { cookie: browserCookie }
      : {}),
  }),
  json: async () => ({}),
}, {
  error: (message) => console.error('[API TEST]', message),
});

  return { request, records };
}

test('Gmail connection requires authentication', async () => {
  const { request } = setup();

  const response = await request(
    '/api/gmail/connect/start',
    'POST',
    false
  );

  assert.equal(response.status, 401);
});

test('Authenticated Supabase user can initiate Gmail OAuth', async () => {
  const { request } = setup();

  const response = await request(
    '/api/gmail/connect/start',
    'POST'
  );

  assert.equal(response.status, 200);
  assert.ok(response.jsonBody.authorizationUrl);

  const url = new URL(response.jsonBody.authorizationUrl);

  assert.equal(url.hostname, 'accounts.google.com');
  assert.ok(url.searchParams.get('state'));
  assert.ok(url.searchParams.get('code_challenge'));
  assert.ok(response.cookies.some(
    cookie => cookie.name === 'ironinbox_oauth'
  ));
});

test('Gmail status belongs to authenticated Supabase user', async () => {
  const { request } = setup();

  const response = await request('/api/gmail/status');

  assert.equal(response.status, 200);
  assert.equal(response.jsonBody.uid, 'supabase-test-user');
  assert.equal(response.jsonBody.connected, false);
});
test('Gmail callback rejects a different browser', async () => {
  const { request } = setup();

  const start = await request('/api/gmail/connect/start', 'POST');
  assert.equal(start.status, 200);

  const authUrl = new URL(start.jsonBody.authorizationUrl);
  const state = authUrl.searchParams.get('state');

  const callback = await request(
    `/api/gmail/callback?state=${encodeURIComponent(state)}&code=test-code`,
    'GET',
    false,
    'ironinbox_oauth=wrong-browser'
  );

  assert.equal(callback.status, 302);
  assert.match(callback.headers.Location, /connection=error/);

  const status = await request('/api/gmail/status');
  assert.equal(status.jsonBody.connected, false);
});

test('Gmail callback rejects an invalid OAuth state', async () => {
  const { request } = setup();

  const callback = await request(
    '/api/gmail/callback?state=invalid-state&code=test-code',
    'GET',
    false,
    'ironinbox_oauth=invalid-browser'
  );

  assert.equal(callback.status, 302);
  assert.match(callback.headers.Location, /connection=error/);
});

test('Successful Gmail callback connects mailbox to Supabase user', async () => {
  const { request } = setup();

  // Start OAuth using the authenticated Supabase user.
  const start = await request('/api/gmail/connect/start', 'POST');
  assert.equal(start.status, 200);

  const authUrl = new URL(start.jsonBody.authorizationUrl);
  const state = authUrl.searchParams.get('state');

  const browser = start.cookies.find(
    cookie => cookie.name === 'ironinbox_oauth'
  );

  assert.ok(browser);

  // Simulate Google redirecting back to IronInbox.
  const callbackPath =
    `/api/gmail/callback?state=${encodeURIComponent(state)}&code=valid-code`;

  const callback = await request(
    callbackPath,
    'GET',
    false,
    `ironinbox_oauth=${browser.value}`
  );

  assert.equal(callback.status, 302);
  assert.match(callback.headers.Location, /connected=1/);

  // Verify the mailbox belongs to the Supabase user.
  const status = await request('/api/gmail/status');

  assert.equal(status.status, 200);
  assert.equal(status.jsonBody.uid, 'supabase-test-user');
  assert.equal(status.jsonBody.connected, true);
  assert.equal(status.jsonBody.email, 'gmail-test@example.com');

  assert.equal(status.jsonBody.mailboxes.length, 1);
  assert.equal(status.jsonBody.mailboxes[0].provider, 'gmail');

  // OAuth state must be single-use.
  const replay = await request(
    callbackPath,
    'GET',
    false,
    `ironinbox_oauth=${browser.value}`
  );

  assert.equal(replay.status, 302);
  assert.match(replay.headers.Location, /connection=error/);

  // The mailbox must remain connected after a replay attempt.
  const finalStatus = await request('/api/gmail/status');
  assert.equal(finalStatus.jsonBody.connected, true);
});
