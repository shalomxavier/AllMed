/**
 * One-time controlled cleanup for the two approved unused Branch Manager
 * accounts: Test (wGx8rhOh6ZgwBy5PJQ9Lwyrr8Hw1) and
 * Crux1 (mlPnSGzZXEaTnwS0ZY4PDXIl8rP2).
 *
 * Safety properties:
 *   - Exact UID matching; names/emails are reported but never used as the key.
 *   - Default mode is --dry-run and performs zero writes.
 *   - Before any deletion, every Firestore collection is scanned for exact UID
 *     references. A hit outside the target users/{uid} document stops execution.
 *   - Deletes only the Firebase Auth identity and users/{uid}; never branches,
 *     employees, shifts, audit logs, or shared operational records.
 *
 * Usage from functions/:
 *   node scripts/cleanup-unused-accounts.js --dry-run
 *   node scripts/cleanup-unused-accounts.js --execute
 */

const admin = require('firebase-admin');
const adminAuth = require('./lib/adminAuth');

const DRY_RUN = !EXECUTE;

const APPROVED_UIDS = [
  'wGx8rhOh6ZgwBy5PJQ9Lwyrr8Hw1', // Test
  'mlPnSGzZXEaTnwS0ZY4PDXIl8rP2', // Crux1
];

/**
 * Firebase Auth/Admin SDK accepted user fields that are safe to show in the
 * report. Firestore user documents are audited separately.
 */
function authSummary(user) {
  return {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    disabled: Boolean(user.disabled),
    emailVerified: Boolean(user.emailVerified),
    providers: (user.providerData || []).map((p) => p.providerId),
    creationTime: user.metadata && user.metadata.creationTime,
    lastSignInTime: user.metadata && user.metadata.lastSignInTime,
    lastRefreshTime: user.metadata && user.metadata.lastRefreshTime,
  };
}

function firestoreUserSummary(data) {
  if (!data) return null;
  return {
    name: data.name || null,
    email: data.email || null,
    roleId: data.roleId || null,
    designation: data.designation || null,
    branch: data.branch ?? null,
    permissionMigrationVersion: data.permissionMigrationVersion ?? null,
    fieldKeys: Object.keys(data).sort(),
  };
}

function initAdmin() {
  adminAuth.initAdmin('cleanup-unused-accounts-adc.json');
}

function containsUid(value, uid) {
  if (value === uid) return true;
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) return value.some((v) => containsUid(v, uid));
    return Object.values(value).some((v) => containsUid(v, uid));
  }
  return false;
}

/**
 * Scans all Firestore documents for exact UID references. Users/{uid} itself is
 * ignored because deleting that document is the task's explicit scope. All
 * other references are reported and block execution.
 */
async function findExternalReferences(db, uid) {
  const references = [];
  const collections = await db.listCollections();
  for (const collection of collections) {
    const snapshot = await collection.get();
    for (const docSnap of snapshot.docs) {
      if (collection.id === 'users' && docSnap.id === uid) continue;
      if (containsUid(docSnap.data(), uid)) {
        references.push({
          collection: collection.id,
          documentId: docSnap.id,
          data: docSnap.data(),
        });
      }
    }
  }
  return references;
}

async function main() {
  if (!DRY_RUN && !EXECUTE) {
    throw new Error('Refusing to run: pass --execute for deletion or --dry-run for review.');
  }

  console.log(DRY_RUN ? '=== ACCOUNT CLEANUP DRY RUN ===' : '=== EXECUTING APPROVED ACCOUNT CLEANUP ===');
  console.log(`Project: ${resolveProjectId() || '(default)'}`);
  console.log(`Targets: ${APPROVED_UIDS.join(', ')}`);
  console.log('');

  initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();

  const targets = [];
  const failures = [];

  for (const uid of APPROVED_UIDS) {
    let authUser = null;
    let authError = null;
    try {
      authUser = await auth.getUser(uid);
    } catch (error) {
      authError = error;
    }

    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    const report = {
      uid,
      auth: authUser ? authSummary(authUser) : { exists: false, error: authError && (authError.code || authError.message) },
      firestoreUser: firestoreUserSummary(userData),
      externalReferences: await findExternalReferences(db, uid),
    };

    if (!authUser && !userDoc.exists) failures.push({ uid, reason: 'No Auth identity or Firestore user document found.' });
    if (report.externalReferences.length > 0) failures.push({ uid, reason: 'External references found.' });
    targets.push(report);
  }

  console.log('Target report:');
  console.log(JSON.stringify(targets, null, 2));
  console.log('');

  if (failures.length > 0) {
    console.error('Dependency or identity verification failed; no records were deleted:');
    console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
    return;
  }

  if (DRY_RUN) {
    console.log('Dry-run verification passed. No Auth identities or Firestore documents were removed.');
    return;
  }

  for (const uid of APPROVED_UIDS) {
    await auth.deleteUser(uid);
    await db.collection('users').doc(uid).delete();
    console.log(`Deleted approved account and user document: ${uid}`);
  }

  console.log('');
  console.log('Post-delete verification:');
  for (const uid of APPROVED_UIDS) {
    let authExists = false;
    try {
      await auth.getUser(uid);
      authExists = true;
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
    const userDoc = await db.collection('users').doc(uid).get();
    console.log(`  ${uid}: auth=${authExists ? 'STILL PRESENT' : 'absent'}, usersDoc=${userDoc.exists ? 'STILL PRESENT' : 'absent'}`);
    if (authExists || userDoc.exists) throw new Error(`Post-delete verification failed for ${uid}`);
  }

  const usersSnapshot = await db.collection('users').get();
  const roleCounts = {};
  const users = usersSnapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const role = data.roleId || data.designation || '(none)';
    roleCounts[role] = (roleCounts[role] || 0) + 1;
    return { uid: docSnap.id, name: data.name || null, email: data.email || null, roleId: data.roleId || null, designation: data.designation || null };
  });
  console.log('');
  console.log('Remaining users:');
  console.log(JSON.stringify({ total: users.length, roleCounts, users }, null, 2));
}

main().catch((error) => {
  console.error('Account cleanup failed:', error);
  process.exit(1);
});
