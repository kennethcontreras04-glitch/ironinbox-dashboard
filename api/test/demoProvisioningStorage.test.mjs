
import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionDemoAccounts } from '../src/demoProvisioningStorage.mjs';

function setup() {
  const records = new Map();
  let writes = 0;

  const storage = {
    async read(key) {
      return structuredClone(records.get(key) || null);
    },
    async write(key, value, etag) {
      const existing = records.get(key);

      if (existing?.etag !== etag) {
        throw new Error('ETag conflict');
      }

      writes++;
      records.set(key, {
        value: structuredClone(value),
        etag: String(writes),
      });
    },
  };

  const account = uid => ({
    uid,
    email: `${uid}@example.com`,
    loginProvider: 'supabase',
    role: 'admin',
    mailboxes: {},
  });

  records.set('users/admin', {
    value: account('admin'),
    etag: 'initial-admin',
  });

  records.set('users/viewer', {
    value: account('viewer'),
    etag: 'initial-viewer',
  });

  const provision = dryRun => provisionDemoAccounts({
    storage,
    adminUid: 'admin',
    viewerUid: 'viewer',
    decryptRecord: record => record.value,
    encryptRecord: value => value,
    dryRun,
  });

  return {
    records,
    provision,
    get writes() {
      return writes;
    },
  };
}

test('dry run validates accounts without writing', async () => {
  const s = setup();

  const result = await s.provision(true);

  assert.equal(result.dryRun, true);
  assert.equal(result.valid, true);
  assert.equal(result.writes, 0);
  assert.equal(s.writes, 0);

  assert.equal(
    s.records.get('users/viewer').value.role,
    'admin'
  );
});

test('provisioning authorizes Admin before activating Viewer', async () => {
  const s = setup();

  const result = await s.provision(false);

  assert.equal(result.dryRun, false);
  assert.equal(result.writes, 2);
  assert.equal(s.writes, 2);

  const admin = s.records.get('users/admin').value;
  const viewer = s.records.get('users/viewer').value;

  assert.equal(admin.demoAccess, true);
  assert.deepEqual(admin.demoViewers, ['viewer']);

  assert.equal(viewer.role, 'viewer');
  assert.deepEqual(viewer.demoMembership, {
    role: 'viewer',
    ownerUid: 'admin',
  });
});



test('failed Viewer update does not activate Viewer access', async () => {
  const s = setup();

  const originalViewer = structuredClone(
    s.records.get('users/viewer').value
  );

  // Simulate another process changing the Viewer ETag
  // after provisioning has read the original record.
  const originalRecord = s.records.get('users/viewer');
  const originalEtag = originalRecord.etag;

  const originalSet = s.records.set.bind(s.records);

  s.records.set = (key, value) => {
    if (key === 'users/admin') {
      // Admin authorization was written successfully.
      // Now simulate a concurrent change to the Viewer.
      const viewerRecord = s.records.get('users/viewer');

      originalSet('users/viewer', {
        ...viewerRecord,
        etag: 'concurrent-update',
      });
    }

    return originalSet(key, value);
  };

  await assert.rejects(
    () => s.provision(false),
    /Manual recovery is required/
  );

  const admin = s.records.get('users/admin').value;
  const viewer = s.records.get('users/viewer').value;

  assert.deepEqual(admin.demoViewers, ['viewer']);
  assert.equal(viewer.role, 'admin');
  assert.equal(viewer.demoMembership, undefined);
  assert.deepEqual(viewer, originalViewer);
  assert.notEqual(
    s.records.get('users/viewer').etag,
    originalEtag
  );
});
