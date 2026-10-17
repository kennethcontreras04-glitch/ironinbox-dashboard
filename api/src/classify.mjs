export const SCHEMA_VERSION = 1;

const BRANDS = {
  paypal: ['paypal.com'],
  microsoft: ['microsoft.com', 'microsoftonline.com', 'office.com', 'outlook.com', 'live.com'],
  google: ['google.com', 'googlemail.com', 'gmail.com', 'youtube.com'],
  amazon: ['amazon.com', 'amazon.co.uk', 'amazon.ca'],
  apple: ['apple.com', 'icloud.com'],
  facebook: ['facebook.com', 'facebookmail.com', 'meta.com'],
  instagram: ['instagram.com'],
  netflix: ['netflix.com'],
  linkedin: ['linkedin.com'],
  wellsfargo: ['wellsfargo.com'],
  chase: ['chase.com'],
};

const HOMOGLYPHS = { 0: 'o', 1: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a' };

// Matched at the start of a word, so "sign in" does not match "design in",
// while "urgently" still matches "urgent".
const PHRASES = [
  'verify your account',
  'confirm your identity',
  'unusual activity',
  'account will be',
  'wire transfer',
  'gift card',
  'confirm your password',
  'credential',
  'sign in',
  'urgent',
  'immediately',
  'suspended',
];

const RISKY_EXTENSIONS = /\.(exe|scr|js|jse|vbs|bat|cmd|ps1|msi|iso|img|lnk|hta|jar|html?|svg|one|zip|7z|rar|docm|xlsm|pptm)$/i;

// Two-part public suffixes, so amazon.co.uk is treated as one registrable domain.
const MULTI_PART_SUFFIXES = new Set(['co.uk', 'org.uk', 'ac.uk', 'com.au', 'co.nz', 'co.jp', 'com.br', 'com.mx', 'co.in', 'co.za']);

// ---------------------------------------------------------------------------
// Normalization (Gmail API `users.messages.get?format=full` -> NormalizedEmail)
// ---------------------------------------------------------------------------

function header(headers, name) {
  return headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function allHeaders(headers, name) {
  return (headers || []).filter((item) => item.name?.toLowerCase() === name.toLowerCase()).map((item) => item.value || '');
}

function decodeBase64Url(value = '') {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// Walks the MIME tree once, collecting the first text/plain and text/html
// bodies plus attachment metadata (attachment bytes are never downloaded).
function walkParts(part, out) {
  const mimeType = part.mimeType || '';
  if (part.filename) {
    out.attachments.push({ filename: part.filename, mimeType, size: part.body?.size || 0 });
  } else if (mimeType === 'text/plain' && part.body?.data && !out.text) {
    out.text = decodeBase64Url(part.body.data);
  } else if (mimeType === 'text/html' && part.body?.data && !out.html) {
    out.html = decodeBase64Url(part.body.data);
  }
  for (const child of part.parts || []) walkParts(child, out);
  return out;
}

function htmlToText(html = '') {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function hostOf(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

const MAX_HTML_CHARS = 100_000;

function extractLinks(html, text) {
  const links = [];
  const seen = new Set();
  const push = (href, linkText) => {
    const host = hostOf(href);
    if (!href || !host || seen.has(href)) return;
    seen.add(href);
    links.push({ href, text: (linkText || href).trim(), host });
  };
  if (html) {
    const pattern = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(html))) {
      push(match[1], htmlToText(match[2]) || match[1]);
    }
  }
  if (!links.length && text) {
    const pattern = /https?:\/\/[^\s<>"']+/gi;
    let match;
    while ((match = pattern.exec(text))) push(match[0], match[0]);
  }
  return links.slice(0, 50);
}

// Parses `"Name" <addr>` or a bare `addr`. A bare address has no display name.
export function parseAddress(value = '') {
  const bracketed = value.match(/<([^>]+)>/);
  const emailMatch = bracketed || value.match(/([^\s<>]+@[^\s<>]+)/);
  const email = (emailMatch?.[1] || '').trim().toLowerCase();
  const name = bracketed ? value.replace(/<[^>]+>/, '').replace(/["']/g, '').trim() : '';
  const domain = email.split('@')[1] || '';
  return { name, email, domain };
}

// Google stamps every inbound message with an Authentication-Results header
// carrying its own SPF / DKIM / DMARC verdicts. We read those instead of
// re-doing DNS checks ourselves.
export function parseAuthenticationResults(value = '') {
  const verdict = (method) => value.match(new RegExp(`\\b${method}=(\\w+)`, 'i'))?.[1]?.toLowerCase() || 'none';
  return { spf: verdict('spf'), dkim: verdict('dkim'), dmarc: verdict('dmarc') };
}

// A sender can add their own fake Authentication-Results header, so prefer
// the one Google's servers added.
function trustedAuthHeader(headers) {
  const values = allHeaders(headers, 'Authentication-Results');
  return values.find((value) => /^\s*mx\.google\.com\b/i.test(value)) || values[0] || '';
}

export function normalizeGmailMessage({ id, threadId, labelIds = [], snippet = '', payload = {}, internalDate }) {
  const headers = payload.headers || [];
  const parts = walkParts(payload, { text: '', html: '', attachments: [] });
  const html = (parts.html || '').slice(0, MAX_HTML_CHARS);
  const text = (parts.text || htmlToText(html)).slice(0, 60_000);
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    threadId: threadId || id,
    labelIds,
    receivedAt: new Date(Number(internalDate || Date.now())).toISOString(),
    from: parseAddress(header(headers, 'From')),
    replyTo: header(headers, 'Reply-To') ? parseAddress(header(headers, 'Reply-To')) : null,
    to: header(headers, 'To'),
    subject: header(headers, 'Subject') || '(no subject)',
    snippet,
    text,
    links: extractLinks(html, text),
    attachments: parts.attachments,
    auth: parseAuthenticationResults(trustedAuthHeader(headers)),
  };
}
function registrable(domain) {
  const labels = (domain || '').toLowerCase().split('.').filter(Boolean);
  if (labels.length >= 3 && MULTI_PART_SUFFIXES.has(labels.slice(-2).join('.'))) {
    return labels.slice(-3).join('.');
  }
  return labels.slice(-2).join('.');
}

function isBrandDomain(domain) {
  const root = registrable(domain);
  return Object.values(BRANDS).some((domains) => domains.includes(root));
}

function isIpHost(host = '') {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\[[0-9a-f:.]+\]$/i.test(host);
}

function looksLikeDomain(value = '') {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(value);
}

function deglyph(label) {
  return label.toLowerCase().replace(/[0134578@]/g, (c) => HOMOGLYPHS[c]);
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

// Returns the brand a domain is imitating, or null.
//  - paypa1.com, app1e.com        -> digit swaps (any brand)
//  - chase-secure.com             -> brand as a hyphen-separated word (any brand)
//  - micr0softsupport.net         -> brand embedded in a longer name (6+ letter brands only,
//                                    so purchase.com / pineapple.com are not flagged)
//  - paypall.com, amazom.com      -> one edit away (6+ letter brands only)
//  - paypal.com.evil.net          -> brand used as a subdomain of someone else's domain
// Known limitation: letter-pair tricks such as rn -> m (arnazon.com) are not detected.
export function lookalikeBrand(domain) {
  if (!domain || isBrandDomain(domain)) return null;
  const root = registrable(domain);
  const label = root.split('.')[0];
  const tokens = label.split('-').map(deglyph);
  const joined = tokens.join('');

  for (const brand of Object.keys(BRANDS)) {
    if (joined === brand || tokens.includes(brand)) return brand;
    if (brand.length >= 6 && joined.includes(brand)) return brand;
    if (brand.length >= 6 && levenshtein(joined, brand) <= 1) return brand;
  }

  const subdomainLabels = domain.toLowerCase().split('.').slice(0, -root.split('.').length);
  for (const sub of subdomainLabels) {
    const cleaned = deglyph(sub).replace(/-/g, '');
    const brand = Object.keys(BRANDS).find((b) => cleaned === b);
    if (brand) return brand;
  }
  return null;
}

// Words that commonly surround a brand in a sender name ("PayPal Support",
// "Wells Fargo Online", "Amazon.com"). They are ignored when checking whether
// a display name is claiming to be a brand.
const SERVICE_WORDS = new Set(['support', 'security', 'service', 'services', 'team', 'account', 'accounts', 'billing', 'help', 'alert', 'alerts', 'notification', 'notifications', 'online', 'bank', 'banking', 'no', 'reply', 'noreply', 'id', 'pay', 'store', 'prime', 'customer', 'care', 'fraud', 'verification', 'center', 'centre', 'com', 'inc', 'official', 'the']);

// Returns the brand a display name claims to be, or null. The whole name
// (minus service words) must be the brand, so "PayPal Support" and
// "Wells Fargo Online" match but "Chase Smith" and "Mark Appleby" do not.
function displayNameBrand(name = '') {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const core = words.filter((word) => !SERVICE_WORDS.has(word)).join('');
  if (!core) return null;
  return Object.keys(BRANDS).find((brand) => core === brand) || null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PHRASE_PATTERNS = PHRASES.map((phrase) => ({ phrase, pattern: new RegExp(`\\b${escapeRegExp(phrase)}`, 'i') }));

// Everyday words that show up in ordinary business mail. They remain visible
// signals, but their combined weight stays below Medium (30) unless a more
// specific keyword or another detector also fires.
export const COMMON_KEYWORDS = new Set([
  'account', 'accounts', 'security', 'confirm', 'confirmation',
  'expires', 'expire', 'expired', 'update', 'updated',
  'password', 'login', 'email', 'user', 'access',
  'notification', 'alert', 'information',
]);
const COMMON_KEYWORD_WEIGHT = 5;
const COMMON_KEYWORD_CAP = 20;
const SPECIFIC_KEYWORD_WEIGHT = 10;

export function riskLevel(score) {
  if (score >= 75) return 'Critical';
  if (score >= 55) return 'High';
  if (score >= 30) return 'Medium';
  return 'Low';
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

// Each rule adds points and an explainable signal. `type` stays within the
// two buckets the UI already groups by ('keyword' = content, 'typo' =
// sender/infrastructure); `detector` says which rule actually fired.
// The final score always equals the sum of signal weights (clamped to 0-100).
export function gradeEmail(email, { keywords = [], options = {} } = {}) {
  const settings = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const signals = [];
  let score = 0;
  const add = (points, signal) => { score += points; signals.push({ source: 'server', weight: points, ...signal }); };

  const fromDomain = email.from?.domain || '';
  const fromName = email.from?.name || '';

  // 1. User keywords from the Keyword Monitoring page.
  // Common words such as "account" and "security" match whole words only and
  // are capped so they cannot raise an otherwise normal message to Medium.
  const matchSubject = settings.matchInSubject !== false;
  const matchBody = settings.matchInBody !== false;
  const haystack = `${matchSubject ? email.subject : ''} ${matchBody ? email.text : ''}`;
  const caseInsensitive = settings.caseInsensitive !== false;
  const source = caseInsensitive ? haystack.toLowerCase() : haystack;
  let commonPoints = 0;
  const terms = Array.isArray(keywords) ? keywords.slice(0, 200) : [];
  for (const keyword of terms) {
    // Bound each term before it is compiled into a pattern (ASVS V5.1.3, V5.1.4).
    const raw = String(keyword).trim().slice(0, 200);
    const needle = caseInsensitive ? raw.toLowerCase() : raw;
    if (!needle) continue;
    const common = COMMON_KEYWORDS.has(needle.toLowerCase());
    const flags = caseInsensitive ? 'i' : '';
    const hit = settings.wholeWordOnly || common
      ? new RegExp(`\\b${escapeRegExp(needle)}\\b`, flags).test(source)
      : source.includes(needle);
    if (!hit) continue;
    let points = common ? COMMON_KEYWORD_WEIGHT : SPECIFIC_KEYWORD_WEIGHT;
    if (common) {
      points = Math.min(points, Math.max(0, COMMON_KEYWORD_CAP - commonPoints));
      commonPoints += points;
    }
    if (points <= 0) continue;
    add(points, {
      type: 'keyword',
      detector: 'user-keyword',
      value: raw,
      description: common
        ? `Common keyword noted at low weight: ${raw}`
        : `Contains monitored keyword: ${raw}`,
    });
  }

  // 2. Built-in pressure / credential phrases. Four hits reach Medium, but text
  // alone stays under the flag line (50) and cannot reach High or Critical.
  const text = `${email.subject} ${email.text}`;
  const phraseHits = PHRASE_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ phrase }) => phrase);
  if (phraseHits.length) {
    const shown = phraseHits.slice(0, 3).join(', ');
    add(Math.min(32, phraseHits.length * 8), { type: 'keyword', detector: 'phrase', value: shown, description: `Pressure or credential language: ${shown}` });
  }

  // 3. Google's own SPF / DKIM / DMARC verdicts.
  const dmarc = email.auth?.dmarc || 'none';
  const spf = email.auth?.spf || 'none';
  const dkim = email.auth?.dkim || 'none';
  if (dmarc === 'fail') add(30, { type: 'typo', detector: 'auth', value: 'dmarc=fail', description: 'DMARC failed: the From domain did not authorize this message.' });
  if (spf === 'fail' || spf === 'softfail') add(12, { type: 'typo', detector: 'auth', value: `spf=${spf}`, description: `SPF ${spf}: the sending server is not authorized for this domain.` });
  if (dkim === 'fail') add(10, { type: 'typo', detector: 'auth', value: 'dkim=fail', description: 'DKIM failed: the message content may have been altered.' });

  // 4. Sender domain imitates a known brand.
  const brand = lookalikeBrand(fromDomain);
  if (brand) add(35, { type: 'typo', detector: 'lookalike-domain', value: fromDomain, description: `Sender domain imitates ${brand}.` });

  // 5. Display name claims a brand the address does not belong to.
  //    Skipped when the lookalike rule already fired for the same brand, so one
  //    piece of evidence is not counted twice.
  const nameBrand = displayNameBrand(fromName);
  if (nameBrand && nameBrand !== brand && !BRANDS[nameBrand].includes(registrable(fromDomain))) {
    add(20, { type: 'typo', detector: 'display-name', value: fromName, description: `Display name says "${fromName}" but the address is ${email.from.email}.` });
  } else if (nameBrand && nameBrand === brand) {
    add(10, { type: 'typo', detector: 'display-name', value: fromName, description: `Display name "${fromName}" matches the imitated brand.` });
  }

  // 6. Replies silently routed to a different domain.
  if (email.replyTo?.domain && registrable(email.replyTo.domain) !== registrable(fromDomain)) {
    add(15, { type: 'typo', detector: 'reply-to', value: email.replyTo.email, description: `Replies go to ${email.replyTo.email}, not the sender's domain.` });
  }

  // 7. Links whose visible text is a domain that differs from the real target.
  for (const link of email.links || []) {
    const shownText = (link.text || '').trim();
    if (!shownText || /\s/.test(shownText)) continue;
    const shownHost = hostOf(/^https?:/i.test(shownText) ? shownText : `https://${shownText}`);
    if (!looksLikeDomain(shownHost) || !link.host) continue;
    if (registrable(shownHost) !== registrable(link.host)) {
      add(20, { type: 'typo', detector: 'link-mismatch', value: link.host, description: `Link text shows ${shownHost} but opens ${link.host}.` });
      break;
    }
  }

  // 8. Links that point straight at an IP address.
  const ipLink = (email.links || []).find((link) => isIpHost(link.host));
  if (ipLink) add(15, { type: 'typo', detector: 'link-ip', value: ipLink.host, description: 'Link points to a raw IP address instead of a domain.' });

  // 9. Dangerous attachment types.
  const risky = (email.attachments || []).find((file) => RISKY_EXTENSIONS.test(file.filename || ''));
  if (risky) add(25, { type: 'typo', detector: 'attachment', value: risky.filename, description: `Attachment type is commonly used to deliver malware: ${risky.filename}` });

  // 10. Gmail itself already thinks it's spam.
  if (email.labelIds?.includes('SPAM')) add(20, { type: 'typo', detector: 'provider-spam', value: 'SPAM', description: 'Gmail classified this message as spam.' });

  // 11. Fully authenticated mail from a known brand's real domain is trusted more.
  if (dmarc === 'pass' && isBrandDomain(fromDomain)) {
    add(-15, { type: 'typo', detector: 'trusted-sender', value: registrable(fromDomain), description: `Authenticated mail from ${registrable(fromDomain)}, a known brand domain.` });
  }

  score = Math.max(0, Math.min(100, score));
  return { riskScore: score, riskLevel: riskLevel(score), signals };
}

// ---------------------------------------------------------------------------
// Output shape the frontend consumes (a superset of the FlaggedEmail type)
// ---------------------------------------------------------------------------

export function toClientEmail(email, grade, disposition, review = null) {
  return {
    id: email.id,
    threadId: email.threadId,
    receivedAt: email.receivedAt,
    received: new Date(email.receivedAt).toLocaleString(),
    sender: email.from?.name ? `${email.from.name} <${email.from.email}>` : email.from?.email || 'Unknown sender',
    senderEmail: email.from?.email || '',
    senderDomain: email.from?.domain || '',
    subject: email.subject,
    snippet: email.snippet,
    content: email.text,
    labelIds: email.labelIds,
    auth: email.auth,
    links: email.links,
    attachments: email.attachments,
    signals: grade.signals,
    riskScore: grade.riskScore,
    riskLevel: grade.riskLevel,
    sourceProvider: email.sourceProvider || 'gmail',
    disposition,
    review: review || undefined,
  };
}

export function presentStoredEmail(record, { keywords = [], options = {}, threshold = 50 } = {}) {
  const grade = gradeEmail(record.email, { keywords, options });
  const disposition = record.review?.disposition ?? (grade.riskScore >= threshold ? 'flagged' : 'safe');
  return toClientEmail(record.email, grade, disposition, record.review);
}

// Microsoft Graph message -> the same representation consumed by gradeEmail.
export function normalizeOutlookMessage(message) {
  const address = item => {
    const email = (item?.emailAddress?.address || '').toLowerCase();
    return { name: item?.emailAddress?.name || '', email, domain: email.split('@')[1] || '' };
  };
  const html = (message.body?.contentType?.toLowerCase() === 'html' ? message.body.content || '' : '').slice(0, MAX_HTML_CHARS);
  const text = (html ? htmlToText(html) : message.body?.content || '').slice(0, 60_000);
  return {
    schemaVersion: SCHEMA_VERSION, sourceProvider: 'outlook', id: message.id,
    threadId: message.conversationId || message.id, labelIds: ['INBOX'],
    receivedAt: new Date(message.receivedDateTime).toISOString(),
    from: address(message.from), replyTo: message.replyTo?.length ? address(message.replyTo[0]) : null,
    to: (message.toRecipients || []).map(item => item.emailAddress?.address).filter(Boolean).join(', '),
    subject: message.subject || '(no subject)', snippet: message.bodyPreview || '', text,
    links: extractLinks(html, text),
    attachments: (message.attachments || []).map(item => ({ filename: item.name || '', mimeType: item.contentType || '', size: item.size || 0 })),
    // Graph exposes raw headers but doesn't mark a trustworthy receiver verdict.
    // Do not grant a trusted-sender discount from sender-supplied authentication headers.
    auth: { spf: 'none', dkim: 'none', dmarc: 'none' },
  };
}
