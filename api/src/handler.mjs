import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { SCHEMA_VERSION, normalizeGmailMessage, presentStoredEmail } from './classify.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const fail = (status, message) => Object.assign(new Error(message), { status });
const json = (status, jsonBody, cookies = []) => ({ status, jsonBody, cookies, headers: { 'Cache-Control': 'no-store' } });
const currentRecord = record => record?.schemaVersion === SCHEMA_VERSION && record.email;
const clientMessages = account => Object.values(account.messages).filter(currentRecord)
  .map(record => presentStoredEmail(record, account.settings))
  .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
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
    id: clip(email.id, 128),
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
    sourceEmailId: clip(item.sourceEmailId, 128),
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
  try { return await request.json(); } catch { throw fail(400, 'A valid JSON body is required.'); }
}

export function createHandler({ env, storage, fetcher = fetch }) {
  const frontend = env.FRONTEND_URL?.replace(/\/$/, '');
  const redirectUri = env.GMAIL_REDIRECT_URI;
  const key = env.TOKEN_ENCRYPTION_KEY ? createHash('sha256').update(env.TOKEN_ENCRYPTION_KEY).digest() : null;
  const ready = Boolean(frontend && redirectUri && key && storage && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const secure = !frontend?.startsWith('http://localhost:');
  const cookie = (name, value, maxAge) => ({ name, value, maxAge, path: '/', httpOnly: true, secure, sameSite: 'Lax' });
  const cookiesOf = (request) => Object.fromEntries((request.headers.get('cookie') || '').split(';').map(x => x.trim().split('=')));
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
  const redirect = (location, cookies = []) => ({ status: 302, headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }, cookies });
  async function google(url, options = {}) {
    const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw fail(502, 'Google could not complete the request. Try reconnecting Gmail.');
    return response.json();
  }
  const exchange = (parameters) => google('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...parameters }),
  });

  return async (request, context = {}) => {
    const url = new URL(request.url);
    const path = url.pathname;
    const cookies = cookiesOf(request);
    try {
      if (request.method === 'GET' && path === '/api/health') return json(200, { configured: ready });
      if (!ready) throw fail(503, 'The API is not configured. Ask the administrator to complete Azure setup.');
      if (request.method === 'POST' && (request.headers.get('origin') !== frontend || !request.headers.get('content-type')?.startsWith('application/json'))) {
        throw fail(403, 'Request origin or content type is not allowed.');
      }
      if (request.method === 'GET' && path === '/api/gmail/connect') {
        const state = random();
        const browser = random();
        await storage.write(`oauth/${hash(state)}`, { browser: hash(browser), expiresAt: Date.now() + 600_000 });
        const query = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri,
          response_type: 'code', scope: 'openid email https://www.googleapis.com/auth/gmail.readonly',
          access_type: 'offline', prompt: 'consent', state });
        return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`, [cookie('ironinbox_oauth', browser, 600)]);
      }
      if (request.method === 'GET' && path === '/api/gmail/callback') {
        const stateKey = `oauth/${hash(url.searchParams.get('state') || '')}`;
        const state = await storage.read(stateKey);
        if (!state || state.value.expiresAt < Date.now() || state.value.browser !== hash(cookies.ironinbox_oauth || '')) throw fail(400, 'Gmail connection expired. Please try again.');
        await storage.remove(stateKey, state.etag); // Consume once across all function instances.
        if (url.searchParams.has('error') || !url.searchParams.get('code')) throw fail(400, 'Gmail permission was not granted.');
        const token = await exchange({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: redirectUri });
        const profile = await google('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
        if (!profile.sub || !profile.email || !profile.email_verified) throw fail(400, 'Google did not return a verified email address.');
        const session = random();
        await storage.write(`sessions/${hash(session)}`, { encrypted: encrypt({
          uid: profile.sub, email: profile.email, accessToken: token.access_token, refreshToken: token.refresh_token,
          tokenExpiresAt: Date.now() + token.expires_in * 1000, expiresAt: Date.now() + 7 * 86400_000,
          messages: {}, lastSyncedAt: null,
        }) });
        return redirect(`${frontend}/login`, [cookie('ironinbox_session', session, 7 * 86400), cookie('ironinbox_oauth', '', 0)]);
      }
      const sessionKey = `sessions/${hash(cookies.ironinbox_session || '')}`;
      const record = cookies.ironinbox_session ? await storage.read(sessionKey) : null;
      const account = record ? decrypt(record.value.encrypted) : null;
      if (!account || account.expiresAt < Date.now()) throw fail(401, 'Please connect Gmail to sign in.');
      if (request.method === 'GET' && path === '/api/gmail/status') return json(200, {
        connected: true, uid: account.uid, email: account.email, lastSyncedAt: account.lastSyncedAt,
      });
      if (request.method === 'POST' && path === '/api/data/wipe') {
        const storedWorkspace = await storage.read(workspaceKey(account.uid));
        if (storedWorkspace) await storage.remove(workspaceKey(account.uid), storedWorkspace.etag);
        await storage.remove(sessionKey, record.etag);
        return json(200, { disconnected: true, wiped: true }, [cookie('ironinbox_session', '', 0)]);
      }
      if (request.method === 'POST' && ['/api/auth/logout', '/api/gmail/disconnect'].includes(path)) {
        await storage.remove(sessionKey, record.etag);
        return json(200, { disconnected: true, wiped: true }, [cookie('ironinbox_session', '', 0)]);
      }
      if (request.method === 'GET' && path === '/api/workspace') {
        const storedWorkspace = await storage.read(workspaceKey(account.uid));
        if (!storedWorkspace) return json(200, { saved: false });
        return json(200, { saved: true, ...decrypt(storedWorkspace.value.encrypted) });
      }
      if (request.method === 'POST' && path === '/api/workspace') {
        const workspace = parseWorkspace(await readJson(request));
        const storedWorkspace = await storage.read(workspaceKey(account.uid));
        await storage.write(workspaceKey(account.uid), { encrypted: encrypt(workspace) }, storedWorkspace?.etag);
        return json(200, { saved: true, ...workspace });
      }
      if (request.method === 'POST' && path === '/api/gmail/sync') {
        const body = await readJson(request);
        if (!body || typeof body !== 'object') throw fail(400, 'A JSON object is required.');
        account.settings = {
          keywords: Array.isArray(body.keywords) ? body.keywords.filter(x => typeof x === 'string').slice(0, 200) : [],
          options: body.options && typeof body.options === 'object' ? body.options : {},
          threshold: Number.isFinite(Number(body.threshold)) ? Math.max(0, Math.min(100, Number(body.threshold))) : 50,
        };
        if (account.tokenExpiresAt < Date.now() + 30_000) {
          if (!account.refreshToken) throw fail(401, 'Please reconnect Gmail to renew access.');
          const token = await exchange({ grant_type: 'refresh_token', refresh_token: account.refreshToken });
          account.accessToken = token.access_token;
          account.refreshToken = token.refresh_token || account.refreshToken;
          account.tokenExpiresAt = Date.now() + token.expires_in * 1000;
        }
        const gmail = (route) => google(`https://gmail.googleapis.com/gmail/v1/users/me/${route}`, { headers: { Authorization: `Bearer ${account.accessToken}` } });
        // Bound work below SWA's 45-second request limit; retain at most 50 records.
        const listed = await gmail('messages?labelIds=INBOX&maxResults=50');
        const ids = (listed.messages || []).map(x => x.id);
        const pending = ids.filter(id => !currentRecord(account.messages[id])).slice(0, 10);
        const messages = await Promise.all(pending.map(id => gmail(`messages/${encodeURIComponent(id)}?format=full`)));
        for (const message of messages) account.messages[message.id] = {
          schemaVersion: SCHEMA_VERSION, email: normalizeGmailMessage(message), review: account.messages[message.id]?.review || null,
        };
        account.messages = Object.fromEntries(ids.filter(id => account.messages[id]).map(id => [id, account.messages[id]]));
        account.lastSyncedAt = new Date().toISOString();
        await storage.write(sessionKey, { encrypted: encrypt(account) }, record.etag);
        return json(200, { added: messages.length, messages: clientMessages(account), lastSyncedAt: account.lastSyncedAt, hasMore: ids.some(id => !currentRecord(account.messages[id])) });
      }
      if (request.method === 'POST' && path === '/api/emails/disposition') {
        const body = await readJson(request);
        if (!body || !Array.isArray(body.ids) || body.ids.some(id => typeof id !== 'string') || !['flagged', 'safe'].includes(body.disposition)) throw fail(400, 'ids[] and disposition (flagged|safe) are required.');
        let updated = 0;
        for (const id of new Set(body.ids)) {
          if (!currentRecord(account.messages[id])) continue;
          account.messages[id].review = { disposition: body.disposition, by: account.email, at: new Date().toISOString() };
          updated++;
        }
        await storage.write(sessionKey, { encrypted: encrypt(account) }, record.etag);
        return json(200, { updated });
      }
      if (request.method === 'GET' && path === '/api/emails') return json(200, { messages: clientMessages(account) });
      return json(404, { error: 'Not found.' });
    } catch (error) {
      const status = error.status || (error.statusCode === 412 || error.statusCode === 404 ? 409 : 500);
      context.error?.(`API request failed (${status})`); // Do not log tokens, message bodies, or OAuth codes.
      if (path === '/api/gmail/callback') return redirect(`${frontend}/login?gmail=error`, [cookie('ironinbox_oauth', '', 0)]);
      return json(status, { error: error.status ? error.message : status === 409 ? 'Mailbox changed during this request. Please retry.' : 'The API request failed. Please try again.' });
    }
  };
}
