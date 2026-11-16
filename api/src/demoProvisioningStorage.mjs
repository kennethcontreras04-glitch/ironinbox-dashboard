
import { prepareDemoProvisioning } from './demoProvisioning.mjs';

export async function provisionDemoAccounts({
  storage,
  adminUid,
  viewerUid,
  decryptRecord,
  encryptRecord,
  dryRun = true,
}) {
  if (!storage || !decryptRecord || !encryptRecord) {
    throw new Error('Storage and encryption functions are required.');
  }

  if (
    typeof adminUid !== 'string' ||
    typeof viewerUid !== 'string' ||
    !adminUid ||
    !viewerUid ||
    adminUid === viewerUid
  ) {
    throw new Error('Two distinct user IDs are required.');
  }

  const adminKey = `users/${adminUid}`;
  const viewerKey = `users/${viewerUid}`;

  const [adminRecord, viewerRecord] = await Promise.all([
    storage.read(adminKey),
    storage.read(viewerKey),
  ]);

  if (!adminRecord || !viewerRecord) {
    throw new Error('Both demo accounts must already exist.');
  }

  const admin = decryptRecord(adminRecord);
  const viewer = decryptRecord(viewerRecord);

  if (admin.uid !== adminUid || viewer.uid !== viewerUid) {
    throw new Error('Stored account identity mismatch.');
  }

  const prepared = prepareDemoProvisioning(admin, viewer);

  if (dryRun) {
    return {
      dryRun: true,
      valid: true,
      accounts: 2,
      writes: 0,
    };
  }

  // Authorize the Viewer on the Admin record first.
  await storage.write(
    adminKey,
    encryptRecord(prepared.admin),
    adminRecord.etag
  );

  try {
    // Activate the Viewer membership only after authorization exists.
    await storage.write(
      viewerKey,
      encryptRecord(prepared.viewer),
      viewerRecord.etag
    );
  } catch (error) {
    // Do not silently overwrite newer Admin changes.
    throw new Error(
      'Viewer provisioning failed after Admin authorization. ' +
      'Manual recovery is required before retrying.',
      { cause: error }
    );
  }

  return {
    dryRun: false,
    valid: true,
    accounts: 2,
    writes: 2,
  };
}
