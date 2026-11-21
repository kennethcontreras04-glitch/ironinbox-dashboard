
export function prepareDemoProvisioning(admin, viewer) {
  if (!admin || !viewer || typeof admin !== 'object' || typeof viewer !== 'object') {
    throw new Error('Both demo accounts are required.');
  }

  if (
    typeof admin.uid !== 'string' ||
    typeof viewer.uid !== 'string' ||
    !admin.uid ||
    !viewer.uid ||
    admin.uid === viewer.uid
  ) {
    throw new Error('Two distinct internal user IDs are required.');
  }

  if (
    admin.loginProvider !== 'supabase' ||
    viewer.loginProvider !== 'supabase'
  ) {
    throw new Error('Both demo accounts must use Supabase authentication.');
  }

  if (
    admin.role !== 'admin' ||
    viewer.role !== 'admin'
  ) {
    throw new Error('Demo accounts must have their original Admin roles.');
  }

  if (
    admin.demoAccess ||
    admin.demoMembership ||
    admin.demoViewers ||
    viewer.demoAccess ||
    viewer.demoMembership ||
    viewer.demoViewers
  ) {
    throw new Error('An existing demo configuration requires manual review.');
  }

  if (
    !viewer.mailboxes ||
    typeof viewer.mailboxes !== 'object' ||
    Array.isArray(viewer.mailboxes) ||
    Object.keys(viewer.mailboxes).length > 0 ||
    (viewer.workspace &&
      Object.keys(viewer.workspace).length > 0)
  ) {
    throw new Error(
      'Demo Viewer must have no connected mailboxes or existing workspace data.'
    );
  }

  return {
    admin: {
      ...admin,
      demoAccess: true,
      demoViewers: [viewer.uid],
    },
    viewer: {
      ...viewer,
      role: 'viewer',
      demoMembership: {
        role: 'viewer',
        ownerUid: admin.uid,
      },
    },
  };
}
