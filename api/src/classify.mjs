export const SCHEMA_VERSION = 1;

// Brands phishers most often impersonate (APWG / vendor brand-phishing reports),
// with the legitimate domains each one really sends from, so their own
// infrastructure (Google Groups, SharePoint, AWS mail...) is not mistaken for a lookalike.
const BRANDS = {
  paypal: ['paypal.com', 'paypal.me'],
  microsoft: ['microsoft.com', 'microsoftonline.com', 'office.com', 'office365.com', 'microsoft365.com', 'outlook.com', 'live.com', 'hotmail.com', 'msn.com', 'sharepoint.com', 'onmicrosoft.com', 'azure.com', 'skype.com'],
  google: ['google.com', 'googlemail.com', 'gmail.com', 'youtube.com', 'googlegroups.com', 'googleusercontent.com', 'googleapis.com', 'withgoogle.com'],
  amazon: ['amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.de', 'amazonaws.com', 'amazonses.com', 'aws.com'],
  apple: ['apple.com', 'icloud.com', 'me.com'],
  facebook: ['facebook.com', 'facebookmail.com', 'meta.com', 'fb.com'],
  instagram: ['instagram.com'],
  whatsapp: ['whatsapp.com'],
  netflix: ['netflix.com', 'netflix.net'],
  linkedin: ['linkedin.com', 'licdn.com'],
  wellsfargo: ['wellsfargo.com', 'wellsfargoadvisors.com', 'wf.com'],
  chase: ['chase.com', 'jpmorganchase.com'],
  dhl: ['dhl.com', 'dhl.de'],
  fedex: ['fedex.com'],
  usps: ['usps.com'],
  docusign: ['docusign.com', 'docusign.net'],
  dropbox: ['dropbox.com', 'dropboxmail.com'],
  adobe: ['adobe.com'],
};

// Personal webmail. Anyone can register these, so they never earn brand trust,
// and a request for money or credentials from one is a business-email-compromise sign.
const FREEMAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'gmx.com', 'mail.com', 'zoho.com', 'yandex.com']);

// Click-tracking and link-protection services that legitimately sit between the
// text a reader sees and the real destination.
const REDIRECT_SERVICES = new Set(['list-manage.com', 'rs6.net', 'sendgrid.net', 'mailchimp.com', 'mcsv.net', 'mandrillapp.com', 'hubspotlinks.com', 'hubspotemail.net', 'sidekickopen.com', 'mailgun.org', 'awstrack.me', 'exct.net', 'mktdns.com', 'mkt.com', 'klclick.com', 'klclick1.com', 'cmail19.com', 'cmail20.com', 'createsend.com', 'safelinks.protection.outlook.com', 'urldefense.com', 'urldefense.proofpoint.com', 'mimecastprotect.com']);
const TRACKING_LABELS = new Set(['click', 'clicks', 'link', 'links', 'email', 'em', 'e', 'trk', 'track', 'tracking', 'go', 'r', 't', 'url', 'mail', 'mailer', 'news', 'newsletter', 'lnk', 'ablink']);

const HOMOGLYPHS = { 0: 'o', 1: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a' };

// Everyday words that show up constantly in legitimate mail. As monitored
// keywords they still appear as signals, but add very little on their own.
const COMMON_KEYWORDS = new Set(['account', 'security', 'confirm', 'verify', 'expires', 'expire', 'click here', 'won', 'win', 'winner', 'prize', 'urgent', 'update', 'password', 'login', 'sign in', 'suspended', 'payment', 'invoice']);

// Requests for credentials, money or risky actions: the heart of most phishing.
// Matched at the start of a word, so "sign in" does not match "design in".
const REQUEST_PHRASES = [
  'verify your account', 'verify your identity', 'confirm your identity', 'confirm your password', 'confirm your account',
  'update your payment', 'payment details', 'bank details', 'banking details', 'direct deposit',
  'gift card', 'wire transfer', 'enable editing', 'enable content', 'enable macros',
  'connect your wallet', 'social security number', 'login credentials', 'keep your current password', 'keep your password',
];
// Pressure and fear language. Common in phishing, but also in ordinary reminders.
const PRESSURE_PHRASES = [
  'urgent', 'immediately', 'unusual activity', 'within 24 hours', 'in 24 hours', 'final notice', 'act now',
  'account will be suspended', 'account will be closed', 'account will be deleted', 'account will be deactivated',
  'account will be locked', 'has been suspended', 'has been locked', 'has been limited', 'expires today', 'keep this between us',
];
// Calls to sign in or verify. Harmless on their own; a strong sign of credential
// phishing when the same email also hides where its links really go.
const CREDENTIAL_CUES = /\b(sign in|signin|log ?in|password|verify|verification|credentials|unlock|restore access)\b/i;
const EXEC_TITLES = /\b(ceo|cfo|coo|president|director|chair|chairman|dean|owner|manager|payroll|hr)\b/i;

// Attachment types by how often they deliver malware or credential-phishing pages.
const EXECUTABLE_ATTACHMENT = /\.(exe|scr|js|jse|vbs|vbe|bat|cmd|ps1|msi|iso|img|vhd|lnk|hta|jar|wsf|cpl)$/i;
const MACRO_OR_PAGE_ATTACHMENT = /\.(docm|xlsm|pptm|xlam|html?|shtml|svg|one)$/i;
const ARCHIVE_ATTACHMENT = /\.(zip|7z|rar|gz|tar|cab|ace)$/i;

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
  const text = (parts.text || htmlToText(parts.html)).slice(0, 60_000);
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
    links: extractLinks(parts.html, text),
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
//
// Design (to keep false positives down without losing real attacks):
//  - Technical evidence (authentication failures, lookalike domains, deceptive
//    links, dangerous attachments) carries most of the weight.
//  - Words alone are weak evidence: keyword and phrase points are capped, so an
//    ordinary password-reset or billing email cannot be flagged on wording alone.
//  - Authenticated mail from a sender's real domain with no technical warning
//    signs gets an even lower wording cap.
//  - Requests for money or credentials from personal webmail are scored as a
//    sender problem, which is how business-email-compromise scams look.
const CONTENT_CAP = 30;
const CONTENT_CAP_AUTHENTICATED = 18;
const KEYWORD_CAP = 12;

const hasPhrase = (text, phrase) => new RegExp(`\\b${escapeRegExp(phrase)}`, 'i').test(text);

function keywordMatches(haystack, keyword, { caseInsensitive, wholeWordOnly }) {
  const raw = String(keyword).trim();
  if (!raw) return false;
  const needle = escapeRegExp(caseInsensitive ? raw.toLowerCase() : raw);
  const flags = caseInsensitive ? 'i' : '';
  // Short words must match whole (so "won" never matches "wonderful"); longer
  // ones match at the start of a word (so "verify" matches "verification").
  if (wholeWordOnly || raw.length <= 4) return new RegExp(`\\b${needle}s?\\b`, flags).test(haystack);
  return new RegExp(`\\b${needle}`, flags).test(haystack);
}

export function gradeEmail(email, { keywords = [], options = {} } = {}) {
  const signals = [];
  let score = 0;
  const add = (points, signal) => { score += points; signals.push({ source: 'server', weight: points, ...signal }); };

  const fromDomain = email.from?.domain || '';
  const fromRoot = registrable(fromDomain);
  const fromName = email.from?.name || '';
  const freemailSender = FREEMAIL.has(fromRoot);
  const dmarc = email.auth?.dmarc || 'none';
  const spf = email.auth?.spf || 'none';
  const dkim = email.auth?.dkim || 'none';
  const authenticated = dmarc === 'pass';
  const text = `${email.subject} ${email.text}`;

  // ---- Technical evidence ------------------------------------------------

  // 1. Authentication. When DMARC passes, SPF/DKIM failures are just mailing-list
  //    or forwarding noise, so they only count when DMARC does not pass.
  if (dmarc === 'fail') add(30, { type: 'typo', detector: 'auth', value: 'dmarc=fail', description: 'DMARC failed: the From domain did not authorize this message.' });
  if (!authenticated && (spf === 'fail' || spf === 'softfail')) add(10, { type: 'typo', detector: 'auth', value: `spf=${spf}`, description: `SPF ${spf}: the sending server is not authorized for this domain.` });
  if (!authenticated && dkim === 'fail') add(8, { type: 'typo', detector: 'auth', value: 'dkim=fail', description: 'DKIM failed: the message content may have been altered.' });
  // Only when the receiving server reported results and none passed. Mail with no
  // verdict at all (e.g. Outlook-synced) is not penalized for that.
  const reported = [spf, dkim, dmarc].some((value) => value !== 'none');
  if (reported && dmarc !== 'pass' && dmarc !== 'fail' && spf !== 'pass' && dkim !== 'pass') {
    add(8, { type: 'typo', detector: 'auth', value: 'unauthenticated', description: 'The sender could not be authenticated (no SPF, DKIM or DMARC pass).' });
  }

  // 2. Sender domain imitates a known brand.
  const brand = lookalikeBrand(fromDomain);
  if (brand) add(35, { type: 'typo', detector: 'lookalike-domain', value: fromDomain, description: `Sender domain imitates ${brand}.` });

  // 3. Display name claims a brand the address does not belong to. Skipped when
  //    the lookalike rule already fired for the same brand, so one piece of
  //    evidence is not counted twice.
  const nameBrand = displayNameBrand(fromName);
  if (nameBrand && nameBrand !== brand && !BRANDS[nameBrand].includes(fromRoot)) {
    add(25, { type: 'typo', detector: 'display-name', value: fromName, description: `Display name says "${fromName}" but the address is ${email.from.email}.` });
  } else if (nameBrand && nameBrand === brand) {
    add(10, { type: 'typo', detector: 'display-name', value: fromName, description: `Display name "${fromName}" matches the imitated brand.` });
  }

  // 4. Replies routed somewhere else. Lists and help desks do this legitimately,
  //    so it only counts when replies go to personal webmail or a lookalike, or
  //    when the sender is not authenticated.
  const replyDomain = email.replyTo?.domain || '';
  if (replyDomain && registrable(replyDomain) !== fromRoot) {
    const replyRoot = registrable(replyDomain);
    if ((FREEMAIL.has(replyRoot) && !freemailSender) || lookalikeBrand(replyDomain)) {
      add(20, { type: 'typo', detector: 'reply-to', value: email.replyTo.email, description: `Replies go to ${email.replyTo.email}, a personal or lookalike address, not the sender's domain.` });
    } else if (!authenticated) {
      add(8, { type: 'typo', detector: 'reply-to', value: email.replyTo.email, description: `Replies go to ${email.replyTo.email}, not the sender's domain.` });
    }
  }

  // 5. Deceptive links: the visible text names one domain but the link opens
  //    another. Ordinary click-tracking is recognized and not counted: known
  //    redirect services, the sender's own domain, or a tracking subdomain
  //    ("click.", "links."...) on mail whose sender is authenticated.
  for (const link of email.links || []) {
    const shownText = (link.text || '').trim();
    if (!shownText || /\s/.test(shownText) || !link.host) continue;
    const shownHost = hostOf(/^https?:/i.test(shownText) ? shownText : `https://${shownText}`);
    if (!looksLikeDomain(shownHost)) continue;
    const target = registrable(link.host);
    if (registrable(shownHost) === target) continue;
    if (REDIRECT_SERVICES.has(target) || [...REDIRECT_SERVICES].some((service) => link.host.endsWith(`.${service}`))) continue;
    if (authenticated && target === fromRoot) continue;
    if (authenticated && TRACKING_LABELS.has(link.host.split('.')[0]) && !isBrandDomain(shownHost) && !lookalikeBrand(shownHost)) continue;
    add(25, { type: 'typo', detector: 'link-mismatch', value: link.host, description: `Link text shows ${shownHost} but opens ${link.host}.` });
    break;
  }

  // 6. Links to a lookalike of a brand (even when the sender looks fine).
  const lookalikeLink = (email.links || []).find((link) => link.host && registrable(link.host) !== fromRoot && lookalikeBrand(link.host));
  if (lookalikeLink) add(25, { type: 'typo', detector: 'lookalike-domain', value: lookalikeLink.host, description: `Link goes to ${lookalikeLink.host}, which imitates ${lookalikeBrand(lookalikeLink.host)}.` });

  // 7. Links that point straight at an IP address.
  const ipLink = (email.links || []).find((link) => isIpHost(link.host));
  if (ipLink) add(30, { type: 'typo', detector: 'link-ip', value: ipLink.host, description: 'Link points to a raw IP address instead of a domain.' });

  // 7b. A sign-in or verify prompt combined with a deceptive link is the
  //     credential-harvesting pattern itself.
  const deceptiveLink = signals.some((signal) => ['link-mismatch', 'link-ip'].includes(signal.detector) || (signal.detector === 'lookalike-domain' && signal.value !== fromDomain));
  if (deceptiveLink && CREDENTIAL_CUES.test(text)) {
    add(15, { type: 'typo', detector: 'credential-lure', value: text.match(CREDENTIAL_CUES)[0], description: 'Asks you to sign in or verify through a link that hides its real destination.' });
  }

  // 8. Dangerous attachments (names only; attachment bytes are never downloaded).
  const files = email.attachments || [];
  const executable = files.find((file) => EXECUTABLE_ATTACHMENT.test(file.filename || ''));
  const macroOrPage = files.find((file) => MACRO_OR_PAGE_ATTACHMENT.test(file.filename || ''));
  const archive = files.find((file) => ARCHIVE_ATTACHMENT.test(file.filename || ''));
  if (executable) add(40, { type: 'typo', detector: 'attachment', value: executable.filename, description: `Program or script attachment, a common way to deliver malware: ${executable.filename}` });
  else if (macroOrPage) add(40, { type: 'typo', detector: 'attachment', value: macroOrPage.filename, description: `Macro document or web-page attachment, often used to steal passwords or run malware: ${macroOrPage.filename}` });
  else if (archive) add(authenticated ? 10 : 25, { type: 'typo', detector: 'attachment', value: archive.filename, description: `Compressed attachment that can hide malware: ${archive.filename}` });

  // 9. Gmail itself already thinks it's spam.
  if (email.labelIds?.includes('SPAM')) add(35, { type: 'typo', detector: 'provider-spam', value: 'SPAM', description: 'Gmail classified this message as spam.' });

  // ---- Wording -----------------------------------------------------------

  const requests = REQUEST_PHRASES.filter((phrase) => hasPhrase(text, phrase));
  const pressure = PRESSURE_PHRASES.filter((phrase) => hasPhrase(text, phrase));

  // 10. Money or credentials requested from personal webmail (or with replies
  //     diverted to it): the classic business-email-compromise pattern.
  const replyToFreemail = FREEMAIL.has(registrable(replyDomain)) && !freemailSender;
  if (requests.length && (freemailSender || replyToFreemail)) {
    const exec = EXEC_TITLES.test(fromName);
    add(exec ? 35 : 25, { type: 'typo', detector: 'freemail-request', value: email.from?.email || '', description: `A request involving ${requests.slice(0, 2).join(', ')} came from a personal email account${exec ? ` using the title "${fromName}"` : ''}.` });
  }

  const technicalWarning = signals.some((signal) => signal.weight > 0);
  let budget = authenticated && !freemailSender && !technicalWarning ? CONTENT_CAP_AUTHENTICATED : CONTENT_CAP;
  const spend = (points) => { const used = Math.max(0, Math.min(points, budget)); budget -= used; return used; };

  if (requests.length) {
    const shown = requests.slice(0, 3).join(', ');
    add(spend(Math.min(20, requests.length * 10)), { type: 'keyword', detector: 'phrase', value: shown, description: `Asks for credentials, money or a risky action: ${shown}` });
  }
  if (pressure.length) {
    const shown = pressure.slice(0, 3).join(', ');
    add(spend(Math.min(12, pressure.length * 4)), { type: 'keyword', detector: 'phrase', value: shown, description: `Pressure or fear language: ${shown}` });
  }
  if (requests.length && pressure.length) {
    add(spend(8), { type: 'keyword', detector: 'phrase', value: 'request + pressure', description: 'Combines a request for credentials or money with time pressure.' });
  }

  // 11. User keywords from the Keyword Monitoring page.
  const matchSubject = options.matchInSubject !== false;
  const matchBody = options.matchInBody !== false;
  const haystack = `${matchSubject ? email.subject : ''} ${matchBody ? email.text : ''}`;
  const matchOptions = { caseInsensitive: options.caseInsensitive !== false, wholeWordOnly: options.wholeWordOnly === true };
  let keywordBudget = KEYWORD_CAP;
  for (const keyword of keywords) {
    if (!keywordMatches(haystack, keyword, matchOptions)) continue;
    const raw = COMMON_KEYWORDS.has(String(keyword).trim().toLowerCase()) ? 2 : 8;
    const points = spend(Math.min(raw, keywordBudget));
    keywordBudget -= points;
    add(points, { type: 'keyword', detector: 'user-keyword', value: keyword, description: `Contains monitored keyword: ${keyword}` });
  }

  // 12. Authenticated mail from a known brand's real domain is trusted more.
  //     Personal webmail never qualifies: anyone can open a Gmail account.
  if (authenticated && isBrandDomain(fromDomain) && !freemailSender) {
    add(-20, { type: 'typo', detector: 'trusted-sender', value: fromRoot, description: `Authenticated mail from ${fromRoot}, a known brand domain.` });
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

// 40 is the default flag threshold: wording alone is capped at 30, so an email
// needs at least one piece of technical evidence to be flagged.
export function presentStoredEmail(record, { keywords = [], options = {}, threshold = 40 } = {}) {
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
  const html = message.body?.contentType?.toLowerCase() === 'html' ? message.body.content || '' : '';
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
