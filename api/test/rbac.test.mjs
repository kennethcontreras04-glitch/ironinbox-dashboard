
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  PERMISSIONS,
  normalizeRole,
  hasPermission,
  requirePermission,
} from '../src/rbac.mjs';

test('roles are normalized securely', () => {
  assert.equal(normalizeRole('admin'), ROLES.ADMIN);
  assert.equal(normalizeRole('manager'), ROLES.MANAGER);
  assert.equal(normalizeRole('viewer'), ROLES.VIEWER);

  for (const role of [undefined, null, '', 'Admin', 'owner', 'superadmin']) {
    assert.equal(normalizeRole(role), ROLES.VIEWER);
  }
});

test('admin has all defined permissions', () => {
  for (const permission of Object.values(PERMISSIONS)) {
    assert.equal(hasPermission('admin', permission), true);
  }
});

test('manager cannot manage roles or view engagement logs', () => {
  assert.equal(hasPermission('manager', PERMISSIONS.VIEW_EMAILS), true);
  assert.equal(hasPermission('manager', PERMISSIONS.MANAGE_EMAILS), true);
  assert.equal(hasPermission('manager', PERMISSIONS.MANAGE_MONITORING), true);
  assert.equal(hasPermission('manager', PERMISSIONS.MANAGE_ROLES), false);
  assert.equal(hasPermission('manager', PERMISSIONS.VIEW_ENGAGEMENT_LOG), false);
});

test('viewer cannot access protected permissions', () => {
  for (const permission of Object.values(PERMISSIONS)) {
    assert.equal(hasPermission('viewer', permission), false);
    assert.throws(
      () => requirePermission('viewer', permission),
      error => error.status === 403
    );
  }
});

test('unknown roles cannot bypass permissions', () => {
  for (const role of ['owner', 'superadmin', '', null, undefined]) {
    assert.equal(hasPermission(role, PERMISSIONS.MANAGE_ROLES), false);
  }
});
