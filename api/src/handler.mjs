import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SCHEMA_VERSION, presentStoredEmail } from './classify.mjs';
import { createProviders } from './providers.mjs';
import { checkSupabaseConnection } from './supabaseHealth.mjs';
import { createSupabaseAuth } from './supabaseAuth.mjs';

const scrypt = promisify(scryptCallback);
const hash = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const fail = (status, message) => Object.assign(new Error(message), { status });
const json = (status, jsonBody, cookies = []) => ({ status, jsonBody, cookies, headers: { 'Cache-Control': 'no-store' } });
const currentRecord = record => record?.schemaVersion === SCHEMA_VERSION && record.email;
const ownedMailbox = (user, id) => typeof id === 'string' && Object.hasOwn(user.mailboxes, id) ? user.mailboxes[id] : null;
const publicMailbox = mailbox => ({ id: mailbox.id, provider: mailbox.provider, accountEmail: mailbox.email,
  connected: true, monitoring: mailbox.monitoring, lastSyncedAt: mailbox.lastSyncedAt });
const clientMessages = user => Object.values(user.mailboxes).filter(mailbox => mailbox.monitoring).flatMap(mailbox =>
  Object.values(mailbox.messages).filter(currentRecord).map(record => ({
    ...presentStoredEmail(record, user.settings), id: `${mailbox.id}:${record.email.id}`,
    mailboxId: mailbox.id, mailboxEmail: mailbox.email, sourceProvider: mailbox.provider,
  }))).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
const workspaceKey = uid => `workspaces/${hash(uid)}`;
const clip = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
function sanitizeKeyword(item) {
  if (!item || typeof item !== 'object') return null;
  const value = clip(item.value, 200).trim();
  if (!value) return null;
  return {
    id: clip(item.id, 64) || String(Date.now()),
    value,
    createdAt: clip(item.createdAt, 40) || new Date().toISOString(),
    enabled: item.enabled !== false,
  };
}
function sanitizeIncidentEmail(email) {
  if (!email || typeof email !== 'object') return undefined;
  return {
    id: clip(email.id, 512),
    sender: clip(email.sender, 300),
    senderEmail: clip(email.senderEmail, 320),
    senderDomain: clip(email.senderDomain, 253),
    subject: clip(email.subject, 500),
    received: clip(email.received, 80),
    receivedAt: clip(email.receivedAt, 40),
    riskLevel: ['Critical', 'High', 'Medium', 'Low'].includes(email.riskLevel) ? email.riskLevel : 'Medium',
    riskScore: Number.isFinite(Number(email.riskScore)) ? Math.max(0, Math.min(100, Number(email.riskScore))) : 0,
    signals: Array.isArray(email.signals) ? email.signals.slice(0, 40).map(signal => ({
      type: signal?.type === 'typo' ? 'typo' : 'keyword',
      value: clip(signal?.value, 200),
      description: clip(signal?.description, 400),
      detector: clip(signal?.detector, 40),
    })) : [],
    auth: email.auth && typeof email.auth === 'object' ? {
      spf: clip(email.auth.spf, 40), dkim: clip(email.auth.dkim, 40), dmarc: clip(email.auth.dmarc, 40),
    } : undefined,
    links: Array.isArray(email.links) ? email.links.slice(0, 30).map(link => ({
      href: clip(link?.href, 500), text: clip(link?.text, 200), host: clip(link?.host, 253),
    })) : [],
    attachments: Array.isArray(email.attachments) ? email.attachments.slice(0, 20).map(file => ({
      filename: clip(file?.filename, 200), mimeType: clip(file?.mimeType, 120),
      size: Number.isFinite(Number(file?.size)) ? Math.max(0, Number(file.size)) : 0,
    })) : [],
    snippet: clip(email.snippet, 500),
    content: clip(email.content, 8000),
    disposition: email.disposition === 'safe' ? 'safe' : email.disposition === 'flagged' ? 'flagged' : undefined,
  };
}
function sanitizeIncident(item) {
  if (!item || typeof item !== 'object') return null;
  const id = clip(item.id, 64);
  if (!id) return null;
  return {
    id,
    createdTime: clip(item.createdTime, 80) || 'Just now',
    reporter: clip(item.reporter, 120) || 'Current User',
    subject: clip(item.subject, 500),
    priority: ['Critical', 'High', 'Medium', 'Low'].includes(item.priority) ? item.priority : 'Medium',
    status: ['Open', 'In Progress', 'Resolved'].includes(item.status) ? item.status : 'Open',
    dueDate: clip(item.dueDate, 80),
    description: clip(item.description, 4000),
    category: clip(item.category, 80),
    assignedTo: clip(item.assignedTo, 120),
    source: clip(item.source, 80),
    sourceEmailId: clip(item.sourceEmailId, 512),
    sourceEmail: sanitizeIncidentEmail(item.sourceEmail),
  };
}
function parseWorkspace(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'A JSON object is required.');
  if (body.keywords !== undefined && !Array.isArray(body.keywords)) throw fail(400, 'keywords must be an array.');
  if (body.incidents !== undefined && !Array.isArray(body.incidents)) throw fail(400, 'incidents must be an array.');
  if (body.riskThreshold !== undefined && !Number.isFinite(Number(body.riskThreshold))) throw fail(400, 'riskThreshold must be a number.');
  const options = body.detectionOptions && typeof body.detectionOptions === 'object' ? body.detectionOptions : {};
  const actions = body.detectionActions && typeof body.detectionActions === 'object' ? body.detectionActions : {};
  return {
    keywords: Array.isArray(body.keywords) ? body.keywords.map(sanitizeKeyword).filter(Boolean).slice(0, 200) : [],
    detectionOptions: {
      caseInsensitive: options.caseInsensitive !== false,
      matchInSubject: options.matchInSubject !== false,
      matchInBody: options.matchInBody !== false,
      wholeWordOnly: options.wholeWordOnly === true,
    },
    detectionActions: {
      flagEmail: actions.flagEmail !== false,
      logMatch: actions.logMatch !== false,
      showInDashboard: actions.showInDashboard !== false,
    },
    riskThreshold: body.riskThreshold === undefined ? 50 : Math.max(0, Math.min(100, Number(body.riskThreshold))),
    incidents: Array.isArray(body.incidents) ? body.incidents.map(sanitizeIncident).filter(Boolean).slice(0, 100) : [],
  };
}
async function readJson(request) {
  let body;
  try { body = await request.json(); } catch { throw fail(400, 'A valid JSON body is required.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'A JSON object is required.');
  return body;
}

export function createHandler({ env, storage, fetcher = fetch }) {
  const frontend = env.FRONTEND_URL?.replace(/\/$/, '');
  const key = env.TOKEN_ENCRYPTION_KEY ? createHash('sha256').update(env.TOKEN_ENCRYPTION_KEY).digest() : null;
  const ready = Boolean(frontend && key && storage);
  const providers = createProviders(env, fetcher);
  const supabaseAuth = createSupabaseAuth(env);
  const secure = !frontend?.startsWith('http://localhost:');
  const cookie = (name, value, maxAge) => ({ name, value, maxAge, path: '/', httpOnly: true, secure, sameSite: 'Lax' });
  const cookiesOf = request => Object.fromEntries((request.headers.get('cookie') || '').split(';').map(x => x.trim().split('=')));
  function encrypt(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map(x => x.toString('base64url')).join('.');
  }
  function decrypt(value) {
    const [iv, tag, data] = value.split('.').map(x => Buffer.from(x, 'base64url'));
    const cipher = createDecipheriv('aes-256-gcm', key, iv);
    cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString());
  }
  const read = async key => {
    const record = await storage.read(key);
    return record ? { value: decrypt(record.value.encrypted), etag: record.etag } : null;
  };
  const write = (key, value, etag) => storage.write(key, { encrypted: encrypt(value) }, etag);
  const redirect = (location, cookies = []) => ({ status: 302, headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }, cookies });
  const newUser = (uid, profile, provider) => ({ uid, email: profile.email, displayName: profile.name || profile.email,
    loginProvider: provider, loginSubject: profile.subject, mailboxes: {}, createdAt: new Date().toISOString() });
  async function identityUser(provider, profile, create = true) {
    const identityKey = `identities/${hash(`${provider}:${profile.subject}`)}`;
    let identity = await read(identityKey);
    if (!identity && create) {
      const uid = random();
      // Reserve a unique provider identity; concurrent first logins retry rather than duplicate it.
      await write(identityKey, { uid });
      identity = await read(identityKey);
    }
    if (!identity) return null;
    const userKey = `users/${identity.value.uid}`;
    let record = await read(userKey);
    if (!record && create) {
      const created = newUser(identity.value.uid, profile, provider);
      const legacyWorkspace = provider === 'gmail' ? await read(workspaceKey(profile.subject)) : null;
      if (legacyWorkspace) {
        const mailboxId = hash('gmail:' + profile.subject);
        created.workspace = legacyWorkspace.value;
        for (const incident of created.workspace.incidents || []) {
          if (incident.sourceEmailId && !incident.sourceEmailId.startsWith(mailboxId + ':')) incident.sourceEmailId = mailboxId + ':' + incident.sourceEmailId;
          if (incident.sourceEmail?.id && !incident.sourceEmail.id.startsWith(mailboxId + ':')) incident.sourceEmail.id = mailboxId + ':' + incident.sourceEmail.id;
        }
        created.legacyWorkspaceKey = workspaceKey(profile.subject);
      }
      await write(userKey, created);
      record = await read(userKey);
    }
    return record ? { ...record, key: userKey } : null;
  }
  async function createSession(uid) {
    const session = random();
    await write(`sessions/${hash(session)}`, { uid, expiresAt: Date.now() + 7 * 86400_000 });
    return cookie('ironinbox_session', session, 7 * 86400);
  }
  function attach(user, provider, profile, token, legacy) {
    const id = hash(`${provider}:${profile.subject}`);
    const existing = user.mailboxes[id];
    if (!token.refresh_token && !existing?.refreshToken && !legacy?.refreshToken) throw fail(400, 'Offline access was not granted. Please reconnect the account and grant access.');
    user.mailboxes[id] = { ...existing, id, provider, subject: profile.subject, email: profile.email,
      accessToken: token.access_token, refreshToken: token.refresh_token || existing?.refreshToken || legacy?.refreshToken,
      tokenExpiresAt: Date.now() + token.expires_in * 1000, monitoring: true,
      messages: existing?.messages || legacy?.messages || {}, lastSyncedAt: existing?.lastSyncedAt || legacy?.lastSyncedAt || null };
  }
  async function sessionUser(cookies) {
    if (!cookies.ironinbox_session) return null;
    const sessionKey = `sessions/${hash(cookies.ironinbox_session)}`;
    const session = await read(sessionKey);
    if (!session || session.value.expiresAt < Date.now()) return null;
    if (session.value.accessToken) {
      // Upgrade an existing Gmail browser session without losing its messages or reviews.
      const legacy = session.value;
      const user = await identityUser('gmail', { subject: legacy.uid, email: legacy.email });
      const id = hash(`gmail:${legacy.uid}`);
      if (!user.value.mailboxes[id]) {
        user.value.mailboxes[id] = { id, provider: 'gmail', subject: legacy.uid, email: legacy.email, accessToken: legacy.accessToken,
          refreshToken: legacy.refreshToken, tokenExpiresAt: legacy.tokenExpiresAt, monitoring: true, messages: legacy.messages || {}, lastSyncedAt: legacy.lastSyncedAt || null };
        user.value.settings ??= legacy.settings;
        await write(user.key, user.value, user.etag);
      }
      await write(sessionKey, { uid: user.value.uid, expiresAt: legacy.expiresAt }, session.etag);
      return { user: await read(user.key), userKey: user.key, session: await read(sessionKey), sessionKey };
    }
    const userKey = `users/${session.value.uid}`;
    const user = await read(userKey);
    return user ? { user, userKey, session, sessionKey } : null;
  }
  async function throttle(username) {
    const rateKey = `login-attempts/${hash(username)}`;
    const record = await read(rateKey);
    const value = record && record.value.until > Date.now() ? record.value : { count: 0, until: Date.now() + 15 * 60_000 };
    if (value.count >= 10) throw fail(429, 'Too many attempts. Please try again in 15 minutes.');
    value.count++;
    await write(rateKey, value, record?.etag);
  }

  return async (request, context = {}) => {
    const url = new URL(request.url);
    const path = url.pathname;
    const cookies = cookiesOf(request);
    let callbackIntent;
    try {
      if (request.method === 'GET' && path === '/api/health') return json(200, { configured: ready,
        providers: Object.fromEntries(Object.entries(providers).map(([name, provider]) => [name, provider.configured])) });
        if (request.method === 'GET' && path === '/api/health/supabase') {
  if (env.IRONINBOX_ENABLE_SUPABASE_DIAGNOSTICS !== 'true') {
    throw fail(404, 'Not found.');
  }

  const result = await checkSupabaseConnection(env, fetcher);
  return json(result.connected ? 200 : 503, result);
}
      if (!ready) throw fail(503, 'The API is not configured. Ask the administrator to complete Azure setup.');
      
if (request.method === 'POST') {
  const origin = request.headers.get('origin');
  const contentType = request.headers.get('content-type');

  const allowedOrigins = [
  frontend,
  ...(env.IRONINBOX_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
].filter(Boolean);

  if (!allowedOrigins.includes(origin) ||
      !contentType?.startsWith('application/json')) {
    throw fail(403, 'Request origin or content type is not allowed.');
  }
}

      
if (request.method === 'POST' &&
    ['/api/auth/supabase/register', '/api/auth/supabase/login'].includes(path)) {

  if (!supabaseAuth) {
    throw fail(503, 'Supabase authentication is not configured.');
  }

  const body = await readJson(request);
  const email = typeof body.email === 'string'
    ? body.email.trim().toLowerCase()
    : '';
  const password = body.password;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== 'string' ||
      password.length < 12 ||
      password.length > 128) {
    throw fail(400, 'Enter a valid email and a password of 12–128 characters.');
  }

  await throttle(`supabase:${email}`);

  if (path === '/api/auth/supabase/register') {
    const firstName = typeof body.firstName === 'string'
      ? body.firstName.trim().slice(0, 100)
      : '';
    const lastName = typeof body.lastName === 'string'
      ? body.lastName.trim().slice(0, 100)
      : '';

    if (!firstName || !lastName) {
      throw fail(400, 'First name and last name are required.');
    }

    try {
      const result = await supabaseAuth.register(
        email, password, firstName, lastName
      );

      return json(202, {
        registered: true,
        requiresConfirmation: result.requiresConfirmation,
        message: 'Check your email to confirm your account.',
      });
    } catch (error) {
      context.log?.('Supabase registration failed', {
        name: error?.name,
        code: error?.code,
        status: error?.status,
      });

      throw fail(400, 'Unable to complete registration. Please try again.');
    }
  }

  let profile;

  try {
    profile = await supabaseAuth.login(email, password);
  } catch (error) {
    context.log?.('Supabase login failed', {
      name: error?.name,
      code: error?.code,
      status: error?.status,
    });

    throw fail(401, 'Unable to sign in. Check your credentials and verify your email.');
  }

  if (!profile?.userId) {
    throw fail(502, 'Supabase did not return a valid user identity.');
  }

  const user = await identityUser('supabase', {
    subject: profile.userId,
    email: profile.email,
    name: `${profile.firstName} ${profile.lastName}`.trim() || profile.email,
  });

  if (!user) {
    throw fail(503, 'Unable to initialize the IronInbox account.');
  }

  return json(200, {
    signedIn: true,
  }, [await createSession(user.value.uid)]);
}

      if (request.method === 'POST' && ['/api/auth/register', '/api/auth/password'].includes(path)) {
        const body = await readJson(request);
        const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
        if (!/^[a-z0-9._-]{3,64}$/.test(username) || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) throw fail(400, 'Use a username of 3–64 letters, numbers, dots, underscores or hyphens, and a password of 12–128 characters.');
        await throttle(username);
        const credentialKey = `credentials/${hash(username)}`;
        const credential = await read(credentialKey);
        const registering = path === '/api/auth/register';
        // Run the same expensive hash for an unknown username to reduce timing disclosure.
        const salt = credential?.value.salt || random();
        const derived = await scrypt(body.password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
        if (registering) {
          if (credential) throw fail(409, 'This username is unavailable.');
          const uid = random();
          await write(credentialKey, { uid, salt, digest: derived.toString('base64url') });
          await write(`users/${uid}`, newUser(uid, { email: username, name: username, subject: username }, 'password'));
          return json(201, { signedIn: true }, [await createSession(uid)]);
        }
        if (!credential || !timingSafeEqual(derived, Buffer.from(credential.value.digest, 'base64url'))) throw fail(401, 'Username or password is incorrect.');
        if (!await read(`users/${credential.value.uid}`)) {
          // Recover a registration interrupted after the credential reservation.
          await write(`users/${credential.value.uid}`, newUser(credential.value.uid, { email: username, name: username, subject: username }, 'password'));
        }
        return json(200, { signedIn: true }, [await createSession(credential.value.uid)]);
      }
      const start = path.match(/^\/api\/(gmail|outlook)\/connect$/) || path.match(/^\/api\/auth\/(gmail|outlook)\/start$/);
      if (request.method === 'GET' && start) {
        const provider = start[1];
        if (!providers[provider].configured) throw fail(503, `${provider === 'gmail' ? 'Google' : 'Microsoft'} is not configured yet.`);
        const intent = path.includes('/auth/') ? 'login' : 'connect';
        const active = await sessionUser(cookies);
        if (intent === 'connect' && !active) throw fail(401, 'Sign in before adding an email account.');
        const state = random();
        const browser = random();
        const verifier = random();
        const reconnectId = url.searchParams.get('mailboxId');
        const reconnect = reconnectId ? active ? ownedMailbox(active.user.value, reconnectId) : null : null;
        if (reconnectId && (!reconnect || reconnect.provider !== provider)) throw fail(404, 'Mailbox not found.');
        const same = intent === 'connect' && url.searchParams.get('same') === '1' && active.user.value.loginProvider === provider;
        await write(`oauth/${hash(state)}`, { provider, intent, browser: hash(browser), verifier,
          expectedSubject: reconnect?.subject || (same ? active.user.value.loginSubject : null),
          session: intent === 'connect' ? hash(cookies.ironinbox_session) : null,
          uid: intent === 'connect' ? active.user.value.uid : null, expiresAt: Date.now() + 600_000 });
        const hint = reconnect?.email || (same ? active.user.value.email : undefined);
        return redirect(providers[provider].authorize(state, verifier, intent, hint), [cookie('ironinbox_oauth', browser, 600)]);
      }
      const callback = path.match(/^\/api\/(gmail|outlook)\/callback$/);
      if (request.method === 'GET' && callback) {
        const provider = callback[1];
        if (!providers[provider].configured) throw fail(503, 'Provider is not configured.');
        const stateKey = `oauth/${hash(url.searchParams.get('state') || '')}`;
        const state = await read(stateKey);
        if (!state || state.value.provider !== provider || state.value.expiresAt < Date.now() || state.value.browser !== hash(cookies.ironinbox_oauth || '')) throw fail(400, 'Connection expired. Please try again.');
        callbackIntent = state.value.intent;
        await storage.remove(stateKey, state.etag);
        if (url.searchParams.has('error') || !url.searchParams.get('code')) throw fail(400, 'Permission was not granted.');
        let active;
        if (callbackIntent === 'connect') {
          active = await sessionUser(cookies);
          if (!active || state.value.session !== hash(cookies.ironinbox_session || '') || state.value.uid !== active.user.value.uid) throw fail(401, 'The signed-in account changed. Please add the mailbox again.');
        }
        const token = await providers[provider].redeem(url.searchParams.get('code'), state.value.verifier);
        const profile = await providers[provider].profile(token.access_token);
        if (callbackIntent === 'connect') {
          if (state.value.expectedSubject && state.value.expectedSubject !== profile.subject) throw fail(400, 'Choose the account you selected to monitor.');
          // Reload after external calls; conditional write prevents disconnect/sync races.
          const user = await read(active.userKey);
          attach(user.value, provider, profile, token);
          await write(active.userKey, user.value, user.etag);
          return redirect(`${frontend}/account?connected=1`, [cookie('ironinbox_oauth', '', 0)]);
        }
        const user = await identityUser(provider, profile);
        return redirect(`${frontend}/login`, [await createSession(user.value.uid), cookie('ironinbox_oauth', '', 0)]);
      }
      const active = await sessionUser(cookies);
      if (!active) throw fail(401, 'Please sign in.');
      const { user: record, userKey, session, sessionKey } = active;
      const user = record.value;
      if (request.method === 'GET' && ['/api/auth/status', '/api/gmail/status'].includes(path)) return json(200, {
        connected: true, uid: user.uid, email: user.email, displayName: user.displayName, loginProvider: user.loginProvider,
        mailboxes: Object.values(user.mailboxes).map(publicMailbox),
      });
      if (request.method === 'POST' && path === '/api/auth/logout') {
        await storage.remove(sessionKey, session.etag);
        return json(200, { signedOut: true }, [cookie('ironinbox_session', '', 0)]);
      }
      if (request.method === 'POST' && path === '/api/data/wipe') {
        user.mailboxes = {};
        delete user.settings;
        delete user.workspace;
        if (user.legacyWorkspaceKey) {
          const legacy = await read(user.legacyWorkspaceKey);
          if (legacy) await storage.remove(user.legacyWorkspaceKey, legacy.etag);
          delete user.legacyWorkspaceKey;
        }
        await write(userKey, user, record.etag);
        return json(200, { wiped: true });
      }
      if (request.method === 'GET' && path === '/api/workspace') return json(200, user.workspace ? { saved: true, ...user.workspace } : { saved: false });
      if (request.method === 'POST' && path === '/api/workspace') {
        user.workspace = parseWorkspace(await readJson(request));
        await write(userKey, user, record.etag);
        return json(200, { saved: true, ...user.workspace });
      }
      if (request.method === 'POST' && ['/api/mailboxes/disconnect', '/api/mailboxes/monitoring', '/api/gmail/disconnect'].includes(path)) {
        const body = await readJson(request);
        const mailbox = ownedMailbox(user, body.mailboxId);
        if (!mailbox) throw fail(404, 'Mailbox not found.');
        if (path === '/api/mailboxes/monitoring') {
          if (typeof body.monitoring !== 'boolean') throw fail(400, 'monitoring must be a boolean.');
          mailbox.monitoring = body.monitoring;
        } else delete user.mailboxes[mailbox.id];
        await write(userKey, user, record.etag);
        return json(200, { mailboxes: Object.values(user.mailboxes).map(publicMailbox) });
      }
      if (request.method === 'POST' && ['/api/mailboxes/sync', '/api/gmail/sync'].includes(path)) {
        const body = await readJson(request);
        const mailbox = body.mailboxId ? ownedMailbox(user, body.mailboxId) : Object.values(user.mailboxes).find(item => item.provider === 'gmail');
        if (!mailbox) throw fail(404, 'Mailbox not found.');
        if (!mailbox.monitoring) throw fail(409, 'Monitoring is paused for this mailbox.');
        const provider = providers[mailbox.provider];
        if (!provider?.configured) throw fail(503, 'This email provider is not configured.');
        user.settings = {
          keywords: Array.isArray(body.keywords) ? body.keywords.filter(x => typeof x === 'string').slice(0, 200) : [],
          options: body.options && typeof body.options === 'object' ? body.options : {},
          threshold: Number.isFinite(Number(body.threshold)) ? Math.max(0, Math.min(100, Number(body.threshold))) : 50,
        };
        if (mailbox.tokenExpiresAt < Date.now() + 30_000) {
          if (!mailbox.refreshToken) throw fail(401, 'Reconnect this mailbox to renew access.');
          const token = await provider.refresh(mailbox.refreshToken);
          mailbox.accessToken = token.access_token;
          mailbox.refreshToken = token.refresh_token || mailbox.refreshToken;
          mailbox.tokenExpiresAt = Date.now() + token.expires_in * 1000;
        }
        const synced = await provider.sync(mailbox, currentRecord);
        for (const email of synced.emails) mailbox.messages[email.id] = { schemaVersion: SCHEMA_VERSION, email, review: mailbox.messages[email.id]?.review || null };
        mailbox.messages = Object.fromEntries(synced.ids.filter(id => mailbox.messages[id]).map(id => [id, mailbox.messages[id]]));
        mailbox.lastSyncedAt = new Date().toISOString();
        await write(userKey, user, record.etag);
        return json(200, { added: synced.emails.length, messages: clientMessages(user), lastSyncedAt: mailbox.lastSyncedAt, hasMore: synced.hasMore });
      }
      if (request.method === 'POST' && path === '/api/emails/disposition') {
        const body = await readJson(request);
        if (!Array.isArray(body.ids) || body.ids.some(id => typeof id !== 'string') || !['flagged', 'safe'].includes(body.disposition)) throw fail(400, 'ids[] and disposition (flagged|safe) are required.');
        let updated = 0;
        for (const id of new Set(body.ids)) {
          const split = id.indexOf(':');
          const mailbox = ownedMailbox(user, id.slice(0, split));
          const message = mailbox?.messages[id.slice(split + 1)];
          if (!currentRecord(message)) continue;
          message.review = { disposition: body.disposition, by: user.email, at: new Date().toISOString() };
          updated++;
        }
        await write(userKey, user, record.etag);
        return json(200, { updated });
      }
      if (request.method === 'GET' && path === '/api/emails') return json(200, { messages: clientMessages(user) });
      return json(404, { error: 'Not found.' });
    } catch (error) {
      const status = error.status || ([412, 404].includes(error.statusCode) ? 409 : 500);
      context.error?.(`API request failed (${status})`);
      if (/^\/api\/(gmail|outlook)\/callback$/.test(path)) return redirect(`${frontend}/${callbackIntent === 'connect' ? 'account?connection' : 'login?auth'}=error`, [cookie('ironinbox_oauth', '', 0)]);
      return json(status, { error: error.status ? error.message : status === 409 ? 'Account changed during this request. Please retry.' : 'The API request failed. Please try again.' });
    }
  };
}
