import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createProviders } from '../src/providers.mjs';

function outlookService({ failId } = {}) {
  let active = 0, peak = 0, rejected = 0;
  const ids = Array.from({ length: 50 }, (_, index) => `message-${index}`);
  const provider = createProviders({}, async url => {
    active++;
    peak = Math.max(peak, active);
    try {
      // Model Outlook's concurrent-request limit, including attachment calls.
      const overLimit = active > 4;
      await delay(2);
      if (overLimit) {
        rejected++;
        return { ok: false, status: 429 };
      }
      const path = new URL(url).pathname;
      if (path.includes('/mailFolders/')) return Response.json({ value: ids.map(id => ({ id })) });
      const id = path.split('/messages/')[1]?.split('/')[0];
      if (id === failId) return Response.json({ error: { code: 'ServiceUnavailable' } }, { status: 503 });
      if (path.endsWith('/attachments')) return Response.json({ value: [{ name: 'report.pdf', contentType: 'application/pdf', size: 100 }] });
      return Response.json({ id, receivedDateTime: '2026-10-28T00:00:00Z',
        body: { contentType: 'text', content: 'Test message' }, hasAttachments: true });
    } finally {
      active--;
    }
  }).outlook;
  return { provider, ids, stats: () => ({ active, peak, rejected }) };
}

test('Outlook sync loads all 50 messages without exceeding mailbox concurrency, then needs no more batches', async () => {
  const service = outlookService();
  const mailbox = { accessToken: 'test-token', messages: {} };
  let batches = 0, result;
  do {
    result = await service.provider.sync(mailbox, Boolean);
    for (const email of result.emails) mailbox.messages[email.id] = email;
    batches++;
    assert.ok(batches <= 10, 'sync must finish within the frontend batch budget');
  } while (result.hasMore);
  assert.equal(batches, 10);
  assert.deepEqual(Object.keys(mailbox.messages), service.ids);
  assert.ok(Object.values(mailbox.messages).every(email => email.attachments[0].filename === 'report.pdf'));
  assert.deepEqual(service.stats(), { active: 0, peak: 4, rejected: 0 });
  const repeat = await service.provider.sync(mailbox, Boolean);
  assert.equal(repeat.emails.length, 0);
  assert.equal(repeat.hasMore, false);
});

test('Outlook sync drains outstanding requests before reporting a failed group', async () => {
  const service = outlookService({ failId: 'message-0' });
  await assert.rejects(service.provider.sync({ accessToken: 'test-token', messages: {} }, Boolean),
    error => error.status === 502);
  assert.equal(service.stats().active, 0);
  assert.equal(service.stats().rejected, 0);
});
