import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGmailMessage, normalizeOutlookMessage, gradeEmail, toClientEmail } from '../src/classify.mjs';

const message = overrides => ({ id: 'outlook-message', conversationId: 'conversation', receivedDateTime: '2026-10-12T12:00:00Z',
  from: { emailAddress: { name: 'PayPal Support', address: 'help@paypa1.com' } },
  replyTo: [{ emailAddress: { address: 'collect@other.example' } }], subject: 'Urgent verify your account',
  body: { contentType: 'HTML', content: '<p>Please confirm your password.</p><a href="https://evil.example">paypal.com</a>' },
  attachments: [{ name: 'invoice.html', contentType: 'text/html', size: 123 }], ...overrides });

test('Outlook normalization uses the shared phishing classifier and provider label', () => {
  const normalized = normalizeOutlookMessage(message());
  assert.equal(normalized.sourceProvider, 'outlook'); assert.equal(normalized.from.domain, 'paypa1.com');
  assert.equal(normalized.threadId, 'conversation'); assert.equal(normalized.replyTo.domain, 'other.example');
  assert.equal(normalized.attachments[0].filename, 'invoice.html'); assert.doesNotMatch(normalized.text, /<a|<p/);
  const grade = gradeEmail(normalized);
  assert.equal(grade.riskLevel, 'Critical');
  for (const detector of ['lookalike-domain', 'reply-to', 'link-mismatch', 'attachment']) assert.ok(grade.signals.some(signal => signal.detector === detector));
  assert.equal(toClientEmail(normalized, grade, 'flagged').sourceProvider, 'outlook');
});

test('Outlook does not grant trusted-brand discounts from untrusted headers', () => {
  const normalized = normalizeOutlookMessage(message({ from: { emailAddress: { address: 'support@paypal.com' } },
    internetMessageHeaders: [{ name: 'Authentication-Results', value: 'mx.google.com; dmarc=pass; spf=pass; dkim=pass' }] }));
  assert.deepEqual(normalized.auth, { spf: 'none', dkim: 'none', dmarc: 'none' });
  assert.ok(gradeEmail(normalized).signals.every(signal => signal.detector !== 'trusted-sender'));
});

test('plain-text Outlook and Gmail messages produce equivalent content and sender signals', () => {
  const text = 'Urgent verify your account at https://192.168.0.1/login';
  const outlook = normalizeOutlookMessage(message({ body: { contentType: 'text', content: text }, attachments: [], replyTo: [] }));
  const gmail = normalizeGmailMessage({ id: 'gmail-message', internalDate: '1791806400000', payload: { mimeType: 'text/plain',
    headers: [{ name: 'From', value: 'PayPal Support <help@paypa1.com>' }, { name: 'Subject', value: 'Urgent verify your account' }], body: { data: Buffer.from(text).toString('base64url') } } });
  assert.equal(outlook.text, gmail.text); assert.deepEqual(outlook.links, gmail.links);
  assert.deepEqual(gradeEmail(outlook), gradeEmail(gmail));
});
