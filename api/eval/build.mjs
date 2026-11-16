// Turns a compact test-email description into a real Gmail API or Microsoft
// Graph message and runs it through the production normalizers, so the
// evaluation exercises the same parsing path as synced mail.
import { normalizeGmailMessage, normalizeOutlookMessage } from '../src/classify.mjs';

const b64 = value => Buffer.from(value, 'utf8').toString('base64url');
const domainOf = from => (from.match(/@([^>\s]+)/)?.[1] || '').toLowerCase();

// Shortcuts for Google's own Authentication-Results verdict.
function authHeader(auth, from) {
  const d = domainOf(from);
  const presets = {
    pass: `dkim=pass header.i=@${d}; spf=pass smtp.mailfrom=${d}; dmarc=pass (p=REJECT) header.from=${d}`,
    fail: `dkim=fail header.i=@${d}; spf=softfail smtp.mailfrom=${d}; dmarc=fail (p=NONE) header.from=${d}`,
    none: `spf=neutral smtp.mailfrom=${d}`,
    // Forwarded through a mailing list: SPF breaks, the original DKIM signature keeps DMARC passing.
    forwarded: `dkim=fail header.i=@lists.example.net; dkim=pass header.i=@${d}; spf=softfail smtp.mailfrom=lists.example.net; dmarc=pass header.from=${d}`,
    nodmarc: `dkim=pass header.i=@${d}; spf=pass smtp.mailfrom=${d}; dmarc=none header.from=${d}`,
  };
  return `mx.google.com; ${presets[auth] ?? auth}`;
}

export function buildEmail(spec, index = 0) {
  if (spec.provider === 'outlook') {
    const addr = value => {
      const email = value.match(/<([^>]+)>/)?.[1] || value;
      const name = value.includes('<') ? value.replace(/<[^>]+>/, '').replace(/"/g, '').trim() : '';
      return { emailAddress: { name, address: email } };
    };
    return normalizeOutlookMessage({
      id: spec.id, conversationId: spec.id, receivedDateTime: '2026-11-10T15:00:00Z',
      from: addr(spec.from), replyTo: spec.replyTo ? [addr(spec.replyTo)] : [],
      subject: spec.subject, bodyPreview: (spec.text || '').slice(0, 120),
      body: spec.html ? { contentType: 'html', content: spec.html } : { contentType: 'text', content: spec.text || '' },
      attachments: (spec.attachments || []).map(name => ({ name, contentType: 'application/octet-stream', size: 2048 })),
    });
  }
  const headers = [
    { name: 'From', value: spec.from },
    { name: 'Subject', value: spec.subject },
    { name: 'Authentication-Results', value: authHeader(spec.auth || 'pass', spec.from) },
  ];
  if (spec.replyTo) headers.push({ name: 'Reply-To', value: spec.replyTo });
  return normalizeGmailMessage({
    id: spec.id, threadId: spec.id, labelIds: spec.labelIds || ['INBOX'], snippet: (spec.text || '').slice(0, 120),
    internalDate: String(1762786800000 + index * 60_000),
    payload: {
      mimeType: 'multipart/mixed', headers,
      parts: [
        { mimeType: 'multipart/alternative', parts: [
          { mimeType: 'text/plain', body: { data: b64(spec.text || '') } },
          ...(spec.html ? [{ mimeType: 'text/html', body: { data: b64(spec.html) } }] : []),
        ] },
        ...(spec.attachments || []).map(filename => ({ mimeType: 'application/octet-stream', filename, body: { size: 2048, attachmentId: 'a' } })),
      ],
    },
  });
}
