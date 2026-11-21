
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDemoProvisioning } from '../src/demoProvisioning.mjs';

function account(uid) {
  return {
    uid,
    email: `${uid}@example.com`,
    loginProvider: 'supabase',
    role: 'admin',
    mailboxes: {},
  };
}

test('prepares two separate Supabase demo accounts', () => {
  const admin = account('admin-123');
  const viewer = account('viewer-456');

  const result = prepareDemoProvisioning(admin, viewer);

  assert.equal(result.admin.role, 'admin');
  assert.equal(result.admin.demoAccess, true);
  assert.deepEqual(result.admin.demoViewers, ['viewer-456']);

  assert.equal(result.viewer.role, 'viewer');
  assert.deepEqual(result.viewer.demoMembership, {
    role: 'viewer',
    ownerUid: 'admin-123',
  });

  assert.equal(admin.demoAccess, undefined);
  assert.equal(viewer.role, 'admin');
});

test('rejects provisioning the same account twice', () => {
  assert.throws(
    () => prepareDemoProvisioning(account('same'), account('same')),
    /distinct internal user IDs/
  );
});

test('rejects accounts using other authentication providers', () => {
  const admin = account('admin');
  const viewer = account('viewer');

  viewer.loginProvider = 'gmail';

  assert.throws(
    () => prepareDemoProvisioning(admin, viewer),
    /Supabase authentication/
  );
});

test('rejects existing demo configurations', () => {
  const admin = account('admin');
  const viewer = account('viewer');

  admin.demoViewers = ['another-user'];

  assert.throws(
    () => prepareDemoProvisioning(admin, viewer),
    /manual review/
  );
});

test('preserves existing mailbox records', () => {
  const admin = account('admin');
  const viewer = account('viewer');

  admin.mailboxes = {
    mailbox1: { id: 'mailbox1', monitoring: true },
  };

  const result = prepareDemoProvisioning(admin, viewer);

  assert.deepEqual(result.admin.mailboxes, admin.mailboxes);
  assert.deepEqual(result.viewer.mailboxes, {});
});


test('rejects Viewer accounts with existing mailbox or workspace data', () => {
  const admin = account('admin');
  const viewer = account('viewer');

  viewer.mailboxes = {
    personal: {
      id: 'personal',
      monitoring: true,
    },
  };

  assert.throws(
    () => prepareDemoProvisioning(admin, viewer),
    /no connected mailboxes or existing workspace data/
  );

  viewer.mailboxes = {};
  viewer.workspace = {
    incidents: [{ id: 'personal-incident' }],
  };

  assert.throws(
    () => prepareDemoProvisioning(admin, viewer),
    /no connected mailboxes or existing workspace data/
  );
});
