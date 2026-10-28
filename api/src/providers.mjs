import { createHash } from 'node:crypto';
import { normalizeGmailMessage, normalizeOutlookMessage } from './classify.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status });

// Provider-specific transport stays out of session, ownership, and review logic.
export function createProviders(env, fetcher = fetch) {
  async function request(provider, url, options = {}) {
    const response = await fetcher(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
    if (!response.ok) {
      const status = [401, 403].includes(response.status) ? 401 : response.status === 429 ? 429 : 502;
      throw fail(status, `${provider} could not complete the request. ${status === 401 ? 'Reconnect this account to renew permission.' : 'Please retry later.'}`);
    }
    return response.json();
  }
  const tenant = env.MICROSOFT_TENANT_ID || 'common';
  const validTenant = /^[a-zA-Z0-9.-]+$/.test(tenant);
  const microsoftAuthority = `https://login.microsoftonline.com/${validTenant ? tenant : 'common'}/oauth2/v2.0`;
  const definitions = {
    gmail: { name: 'Google', clientId: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET,
      redirect: env.GMAIL_REDIRECT_URI, authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token', identityScopes: 'openid email profile',
      mailScopes: 'openid email profile https://www.googleapis.com/auth/gmail.readonly' },
    outlook: { name: 'Microsoft', clientId: env.MICROSOFT_CLIENT_ID, secret: env.MICROSOFT_CLIENT_SECRET,
      redirect: env.MICROSOFT_REDIRECT_URI, authorize: `${microsoftAuthority}/authorize`,
      token: `${microsoftAuthority}/token`, identityScopes: 'openid profile email https://graph.microsoft.com/User.Read',
      mailScopes: 'openid profile email offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read' },
  };
  return Object.fromEntries(Object.entries(definitions).map(([provider, config]) => {
    const exchange = parameters => request(config.name, config.token, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.secret, ...parameters }),
    });
    const api = (accessToken, route, signal) => request(config.name,
      provider === 'gmail' ? `https://gmail.googleapis.com/gmail/v1/users/me/${route}` : `https://graph.microsoft.com/v1.0/me/${route}`,
      { signal, headers: { Authorization: `Bearer ${accessToken}`, ...(provider === 'outlook' ? { Prefer: 'IdType="ImmutableId"' } : {}) } });
    return [provider, {
      configured: Boolean(config.clientId && config.secret && config.redirect && (provider !== 'outlook' || validTenant)),
      authorize(state, verifier, intent, loginHint) {
        const query = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirect,
          response_type: 'code', response_mode: 'query', state,
          scope: intent === 'login' ? config.identityScopes : config.mailScopes,
          code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
          prompt: intent === 'login' || (provider === 'outlook' && !loginHint) ? 'select_account' : provider === 'gmail' ? 'consent select_account' : 'consent' });
        if (provider === 'gmail' && intent !== 'login') query.set('access_type', 'offline');
        if (loginHint) query.set('login_hint', loginHint);
        return `${config.authorize}?${query}`;
      },
      redeem: (code, verifier) => exchange({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: config.redirect }),
      refresh: refreshToken => exchange({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      async profile(accessToken) {
        const headers = { Authorization: `Bearer ${accessToken}` };
        const identity = await request(config.name, provider === 'gmail'
          ? 'https://www.googleapis.com/oauth2/v3/userinfo' : 'https://graph.microsoft.com/oidc/userinfo', { headers });
        if (!identity.sub || (provider === 'gmail' && !identity.email_verified)) throw fail(400, 'Provider did not return a verified identity.');
        // The authoritative subject comes from userinfo, never an unverified JWT or email address.
        const profile = provider === 'outlook' ? await api(accessToken, '?$select=id,mail,userPrincipalName,displayName') : identity;
        const email = provider === 'gmail' ? identity.email : profile.mail || profile.userPrincipalName;
        if (!email) throw fail(400, 'Provider did not return an account address.');
        return { subject: identity.sub, email, name: profile.displayName || identity.name || email };
      },
      async sync(mailbox, isCurrent) {
        if (provider === 'gmail') {
          const listed = await api(mailbox.accessToken, 'messages?labelIds=INBOX&maxResults=50');
          const ids = (listed.messages || []).map(item => item.id);
          const pending = ids.filter(id => !isCurrent(mailbox.messages[id])).slice(0, 10);
          const messages = await Promise.all(pending.map(id => api(mailbox.accessToken, `messages/${encodeURIComponent(id)}?format=full`)));
          return { ids, emails: messages.map(normalizeGmailMessage), hasMore: ids.some(id => !isCurrent(mailbox.messages[id]) && !pending.includes(id)) };
        }
        const budget = AbortSignal.timeout(24000);
        const graph = route => api(mailbox.accessToken, route, budget);
        const fields = 'id,conversationId,receivedDateTime,from,replyTo,toRecipients,subject,bodyPreview';
        const listed = await graph(`mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime%20desc&$select=${fields}`);
        const ids = (listed.value || []).map(item => item.id);
        const pending = ids.filter(id => !isCurrent(mailbox.messages[id])).slice(0, 5);
        const loadEmail = async id => {
          // Bound work to the managed Functions limit; never request attachment bytes.
          const message = await graph(`messages/${encodeURIComponent(id)}?$select=${fields},body,hasAttachments`);
          const attachments = [];
          let route = `messages/${encodeURIComponent(id)}/attachments?$select=id,name,contentType,size,isInline&$top=50`;
          if (message.hasAttachments) {
            for (let page = 0; page < 4 && route; page++) {
              const data = await graph(route);
              attachments.push(...(data.value || []));
              route = null;
              if (data['@odata.nextLink']) {
                const next = new URL(data['@odata.nextLink']);
                const prefix = `/v1.0/me/messages/${encodeURIComponent(id)}/attachments`;
                if (next.origin !== 'https://graph.microsoft.com' || next.pathname !== prefix) throw fail(502, 'Unexpected Microsoft attachment page.');
                route = next.pathname.slice('/v1.0/me/'.length) + next.search;
              }
            }
            if (route) throw fail(502, 'This message has too many attachments to analyze in one request.');
          }
          return normalizeOutlookMessage({ ...message, attachments });
        };
        const emails = [];
        // Outlook permits at most four concurrent requests per app/mailbox.
        // Drain each group even on failure so requests cannot outlive this sync.
        for (let offset = 0; offset < pending.length; offset += 4) {
          const results = await Promise.allSettled(pending.slice(offset, offset + 4).map(loadEmail));
          const failed = results.find(result => result.status === 'rejected');
          if (failed) throw failed.reason;
          emails.push(...results.map(result => result.value));
        }
        return { ids, emails, hasMore: ids.some(id => !isCurrent(mailbox.messages[id]) && !pending.includes(id)) };
      },
    }];
  }));
}
