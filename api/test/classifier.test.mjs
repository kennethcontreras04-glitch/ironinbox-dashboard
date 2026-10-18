import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAddress,
  parseAuthenticationResults,
  normalizeGmailMessage,
  lookalikeBrand,
  gradeEmail,
  toClientEmail,
} from '../src/classify.mjs';

const b64 = (value) => Buffer.from(value, 'utf8').toString('base64url');

function gmailMessage({ from, replyTo, subject, html, text, auth, labelIds = ['INBOX'], attachments = [], extraHeaders = [] }) {
  const headers = [
    { name: 'From', value: from },
    { name: 'Subject', value: subject },
    ...extraHeaders,
    { name: 'Authentication-Results', value: auth },
  ];
  if (replyTo) headers.push({ name: 'Reply-To', value: replyTo });
  return {
    id: 'm1', threadId: 't1', labelIds, snippet: 'snippet', internalDate: '1767225600000',
    payload: {
      mimeType: 'multipart/mixed', headers,
      parts: [
        { mimeType: 'multipart/alternative', parts: [
          { mimeType: 'text/plain', body: { data: b64(text || '') } },
          { mimeType: 'text/html', body: { data: b64(html || '') } },
        ] },
        ...attachments.map((filename) => ({ mimeType: 'application/octet-stream', filename, body: { size: 1024, attachmentId: 'a' } })),
      ],
    },
  };
}

const PASS = 'mx.google.com; dkim=pass header.i=@example.com; spf=pass smtp.mailfrom=example.com; dmarc=pass (p=REJECT) header.from=example.com';
const FAIL = 'mx.google.com; dkim=fail header.i=@paypa1.com; spf=softfail smtp.mailfrom=paypa1.com; dmarc=fail (p=NONE) header.from=paypa1.com';

const sumOfWeights = (grade) => grade.signals.reduce((total, s) => total + s.weight, 0);

// --- Original tests ---------------------------------------------------------

test('parses sender and auth headers', () => {
  assert.deepEqual(parseAddress('"PayPal Support" <Help@PayPa1.com>'), { name: 'PayPal Support', email: 'help@paypa1.com', domain: 'paypa1.com' });
  assert.deepEqual(parseAuthenticationResults(FAIL), { spf: 'softfail', dkim: 'fail', dmarc: 'fail' });
  assert.deepEqual(parseAuthenticationResults(''), { spf: 'none', dkim: 'none', dmarc: 'none' });
});

test('detects lookalike domains without flagging the real ones', () => {
  assert.equal(lookalikeBrand('paypa1.com'), 'paypal');
  assert.equal(lookalikeBrand('micr0soft-support.net'), 'microsoft');
  assert.equal(lookalikeBrand('arnazon.com'), null); // rn->m is out of scope for now; documented
  assert.equal(lookalikeBrand('paypal.com'), null);
  assert.equal(lookalikeBrand('mail.google.com'), null);
  assert.equal(lookalikeBrand('example.com'), null);
});

test('normalizes a multipart Gmail message', () => {
  const email = normalizeGmailMessage(gmailMessage({
    from: 'Alice <alice@example.com>', subject: 'Hi', text: 'plain body', html: '<a href="https://example.com/x">example.com</a>', auth: PASS,
    attachments: ['report.pdf'],
  }));
  assert.equal(email.text, 'plain body');
  assert.equal(email.receivedAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(email.links, [{ href: 'https://example.com/x', text: 'example.com', host: 'example.com' }]);
  assert.deepEqual(email.attachments, [{ filename: 'report.pdf', mimeType: 'application/octet-stream', size: 1024 }]);
  assert.equal(email.auth.dmarc, 'pass');
});

test('grades a classic credential phish as Critical', () => {
  const email = normalizeGmailMessage(gmailMessage({
    from: '"PayPal" <security@paypa1.com>', replyTo: 'collect@evil.example', subject: 'Urgent: verify your account',
    html: 'Your account will be suspended. <a href="http://198.51.100.7/login">https://www.paypal.com/signin</a>', auth: FAIL,
  }));
  const grade = gradeEmail(email, { keywords: ['verify'] });
  const detectors = grade.signals.map((s) => s.detector);
  for (const d of ['user-keyword', 'phrase', 'auth', 'lookalike-domain', 'display-name', 'reply-to', 'link-mismatch', 'link-ip']) {
    assert.ok(detectors.includes(d), `expected ${d} in ${detectors}`);
  }
  assert.equal(grade.riskLevel, 'Critical');
});

test('grades an authenticated, ordinary email as Low', () => {
  const email = normalizeGmailMessage(gmailMessage({
    from: 'Alice <alice@example.com>', subject: 'Lunch Thursday?', text: 'Want to grab lunch? https://maps.example.com/place', auth: PASS,
  }));
  const grade = gradeEmail(email, { keywords: ['invoice'] });
  assert.equal(grade.riskScore, 0);
  assert.equal(grade.riskLevel, 'Low');
});

test('respects detection options for keywords', () => {
  const email = normalizeGmailMessage(gmailMessage({ from: 'a@example.com', subject: 'Password reset', text: 'nothing here', auth: PASS }));
  assert.equal(gradeEmail(email, { keywords: ['password'] }).signals.length, 1);
  assert.equal(gradeEmail(email, { keywords: ['password'], options: { matchInSubject: false } }).signals.length, 0);
  assert.equal(gradeEmail(email, { keywords: ['pass'], options: { wholeWordOnly: true } }).signals.length, 0);
});

test('flags dangerous attachments', () => {
  const email = normalizeGmailMessage(gmailMessage({ from: 'a@example.com', subject: 'Scan', text: 'see attached', auth: PASS, attachments: ['scan.pdf.html'] }));
  assert.ok(gradeEmail(email).signals.some((s) => s.detector === 'attachment'));
});

// --- Fix 1: bare addresses have no display name ------------------------------

test('a bare From address has no display name', () => {
  assert.deepEqual(parseAddress('support@paypal-help.com'), { name: '', email: 'support@paypal-help.com', domain: 'paypal-help.com' });
});

test('a bare lookalike address is not double-counted as a display-name claim', () => {
  const email = normalizeGmailMessage(gmailMessage({ from: 'support@paypa1.com', subject: 'Hello', text: 'hi', auth: PASS }));
  const detectors = gradeEmail(email).signals.map((s) => s.detector);
  assert.ok(detectors.includes('lookalike-domain'));
  assert.ok(!detectors.includes('display-name'));
});

test('client sender line is formatted correctly', () => {
  const named = normalizeGmailMessage(gmailMessage({ from: 'Alice <alice@example.com>', subject: 'x', text: 'x', auth: PASS }));
  const bare = normalizeGmailMessage(gmailMessage({ from: 'alice@example.com', subject: 'x', text: 'x', auth: PASS }));
  assert.equal(toClientEmail(named, gradeEmail(named), 'safe').sender, 'Alice <alice@example.com>');
  assert.equal(toClientEmail(bare, gradeEmail(bare), 'safe').sender, 'alice@example.com');
});

// --- Fix 2: brand names inside real people's names ---------------------------

test('people whose names contain a brand are not flagged', () => {
  for (const from of ['Chase Smith <chase.smith@gmail.com>', 'Mark Appleby <mark@gmail.com>', 'Paypaldo Ruiz <p@gmail.com>']) {
    const email = normalizeGmailMessage(gmailMessage({ from, subject: 'Notes from class', text: 'see you monday', auth: PASS }));
    const grade = gradeEmail(email);
    assert.ok(!grade.signals.some((s) => s.detector === 'display-name'), `display-name fired for ${from}`);
    assert.equal(grade.riskLevel, 'Low');
  }
});

test('brand display names from the wrong domain are still flagged', () => {
  for (const from of ['"PayPal Support" <help@gmail.com>', 'Wells Fargo Online <alerts@mailer.example>', 'Amazon.com <orders@random.example>']) {
    const email = normalizeGmailMessage(gmailMessage({ from, subject: 'Hi', text: 'hi', auth: PASS }));
    assert.ok(gradeEmail(email).signals.some((s) => s.detector === 'display-name'), `display-name missed for ${from}`);
  }
});

// --- Fix 3: lookalike false positives ----------------------------------------

test('ordinary words and real brand sending domains are not lookalikes', () => {
  for (const domain of ['purchase.com', 'pineapple.com', 'facebookmail.com', 'googlemail.com', 'microsoftonline.com', 'amazon.co.uk', 'email.chase.com']) {
    assert.equal(lookalikeBrand(domain), null, `${domain} flagged`);
  }
});

test('still catches common lookalike patterns', () => {
  assert.equal(lookalikeBrand('chase-secure.com'), 'chase');
  assert.equal(lookalikeBrand('app1e.com'), 'apple');
  assert.equal(lookalikeBrand('paypall.com'), 'paypal');
  assert.equal(lookalikeBrand('netflixbilling.net'), 'netflix');
  assert.equal(lookalikeBrand('paypal.com.evil.net'), 'paypal');
  assert.equal(lookalikeBrand('amazon-support.co.uk'), 'amazon');
});

// --- Fix 4: every point is explained -----------------------------------------

test('trusted-brand discount appears as a signal and weights add up to the score', () => {
  const email = normalizeGmailMessage(gmailMessage({
    from: 'PayPal <service@paypal.com>', subject: 'Please verify your account', text: 'Unusual activity was detected.', auth: PASS,
  }));
  const grade = gradeEmail(email);
  assert.ok(grade.signals.some((s) => s.detector === 'trusted-sender' && s.weight === -15));
  assert.equal(grade.riskScore, Math.max(0, sumOfWeights(grade)));
});

// --- Smaller fixes ------------------------------------------------------------

test('phrases match whole words only', () => {
  const email = normalizeGmailMessage(gmailMessage({ from: 'a@example.com', subject: 'Portfolio', text: 'My design in Figma is ready.', auth: PASS }));
  assert.ok(!gradeEmail(email).signals.some((s) => s.detector === 'phrase'));
});

test('link text that is not a domain does not trigger link-mismatch', () => {
  const email = normalizeGmailMessage(gmailMessage({
    from: 'a@example.com', subject: 'Newsletter', text: '', auth: PASS,
    html: '<a href="https://click.mailer.example/abc">Read more.</a> <a href="https://click.mailer.example/def">v1.2</a>',
  }));
  assert.ok(!gradeEmail(email).signals.some((s) => s.detector === 'link-mismatch'));
});

test('flags .svg and .one attachments', () => {
  for (const file of ['invoice.svg', 'notes.one']) {
    const email = normalizeGmailMessage(gmailMessage({ from: 'a@example.com', subject: 'File', text: 'attached', auth: PASS, attachments: [file] }));
    assert.ok(gradeEmail(email).signals.some((s) => s.detector === 'attachment'), `${file} not flagged`);
  }
});

test("prefers Google's Authentication-Results over a forged one", () => {
  const email = normalizeGmailMessage(gmailMessage({
    from: 'a@paypa1.com', subject: 'x', text: 'x', auth: FAIL,
    extraHeaders: [{ name: 'Authentication-Results', value: 'attacker.example; spf=pass; dkim=pass; dmarc=pass' }],
  }));
  assert.equal(email.auth.dmarc, 'fail');
});
