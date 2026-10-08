/**
 * One-time migration script to seed the five fixed RBAC roles and add roleId
 * to every existing user document based on their legacy designation field.
 *
 * Run from the functions directory with a service account credential:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
 *     node scripts/migrate-rbac.js
 *
 * Dry-run (reports only, no writes):
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
 *     node scripts/migrate-rbac.js --dry-run
 *
 * The script is idempotent: it will update existing role documents in place and
 * only set roleId on users that do not already have one. It never removes or
 * modifies the legacy `designation` field.
 */

const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');

const ROLE_IDS = {
  DIRECTOR: 'director',
  HR: 'hr',
  OPERATIONS_MANAGER: 'operations-manager',
  BRANCH_MANAGER: 'branch-manager',
  WHATSAPP_MESSAGER: 'whatsapp-messager',
};

const ROLE_NAMES = {
  [ROLE_IDS.DIRECTOR]: 'Director',
  [ROLE_IDS.HR]: 'HR',
  [ROLE_IDS.OPERATIONS_MANAGER]: 'Operations Manager',
  [ROLE_IDS.BRANCH_MANAGER]: 'Branch Manager',
  [ROLE_IDS.WHATSAPP_MESSAGER]: 'WhatsApp Messager',
};

const FULL_ACCESS = {
  employees: { accessMode: 'full' },
  attendanceLogs: { accessMode: 'full' },
  shifts: { accessMode: 'full' },
  leaves: { accessMode: 'full' },
  reports: { accessMode: 'full' },
  insights: { accessMode: 'full' },
  devices: { accessMode: 'full' },
  masters: { accessMode: 'full' },
  dms: { accessMode: 'full' },
  users: { accessMode: 'full' },
};

const hrPermissions = {
  employees: { accessMode: 'full' },
  attendanceLogs: { accessMode: 'full' },
  shifts: { accessMode: 'full' },
  leaves: { accessMode: 'full' },
  reports: { accessMode: 'full' },
  insights: { accessMode: 'full' },
  devices: { accessMode: 'full' },
  masters: { accessMode: 'full' },
  users: {
    accessMode: 'custom',
    items: {
      userManagement: { actions: ['view', 'add', 'edit', 'delete'] },
    },
  },
};

const operationsManagerPermissions = {
  dms: { accessMode: 'full' },
  users: {
    accessMode: 'custom',
    items: {
      userManagement: { actions: ['view', 'add', 'edit'] },
    },
  },
};

const branchManagerPermissions = {
  employees: {
    accessMode: 'custom',
    items: {
      employeeManagement: { actions: ['view', 'edit'] },
      shiftAssignment: { actions: ['view', 'add', 'edit', 'delete'] },
    },
  },
  attendanceLogs: {
    accessMode: 'custom',
    items: {
      rawPunches: { actions: ['view'] },
    },
  },
  shifts: {
    accessMode: 'custom',
    items: { shifts: { actions: ['view', 'edit'] } },
  },
  leaves: {
    accessMode: 'custom',
    items: {
      leaves: { actions: ['view', 'add', 'edit'] },
      weekOffs: { actions: ['view', 'add', 'edit'] },
      leaveLimits: { actions: ['view'] },
    },
  },
  reports: {
    accessMode: 'custom',
    items: {
      monthlyReport: { actions: ['view', 'export'] },
      dailyReport: { actions: ['view', 'export'] },
      shiftReport: { actions: ['view', 'export'] },
      employeeMasterReport: { actions: ['view', 'export'] },
    },
  },
  insights: { accessMode: 'full' },
};

const whatsappMessagerPermissions = {
  dms: { accessMode: 'full' },
};

const DEFAULT_ROLE_PERMISSIONS = {
  [ROLE_IDS.DIRECTOR]: FULL_ACCESS,
  [ROLE_IDS.HR]: hrPermissions,
  [ROLE_IDS.OPERATIONS_MANAGER]: operationsManagerPermissions,
  [ROLE_IDS.BRANCH_MANAGER]: branchManagerPermissions,
  [ROLE_IDS.WHATSAPP_MESSAGER]: whatsappMessagerPermissions,
};

module.exports = {
  ROLE_IDS,
  ROLE_NAMES,
  DEFAULT_ROLE_PERMISSIONS,
  getRoleIdFromDesignation,
  seedRoles,
  migrateUsers,
};

function getRoleIdFromDesignation(designation) {
  if (!designation) return '';
  const normalized = designation.trim().toLowerCase();
  switch (normalized) {
    case 'director':
      return ROLE_IDS.DIRECTOR;
    case 'hr':
      return ROLE_IDS.HR;
    case 'operations manager':
      return ROLE_IDS.OPERATIONS_MANAGER;
    case 'branch manager':
      return ROLE_IDS.BRANCH_MANAGER;
    case 'whatsapp messager':
      return ROLE_IDS.WHATSAPP_MESSAGER;
    default:
      return '';
  }
}

async function getRoleState(db, roleId) {
  const roleRef = db.collection('roles').doc(roleId);
  const existing = await roleRef.get();
  const expected = {
    name: ROLE_NAMES[roleId],
    description: `Fixed application role: ${ROLE_NAMES[roleId]}`,
    isFixed: true,
    permissions: DEFAULT_ROLE_PERMISSIONS[roleId],
  };
  const needsCreate = !existing.exists;
  const needsUpdate = !needsCreate && JSON.stringify(existing.data().permissions) !== JSON.stringify(expected.permissions);
  return { roleId, expected, needsCreate, needsUpdate, exists: existing.exists };
}

async function seedRoles(db) {
  console.log(DRY_RUN ? '[DRY RUN] Role seeding report:' : 'Seeding fixed roles...');
  const roleIds = Object.keys(ROLE_NAMES);
  for (const roleId of roleIds) {
    const state = await getRoleState(db, roleId);
    if (state.needsCreate) {
      console.log(`  ${roleId}: will CREATE`);
    } else if (state.needsUpdate) {
      console.log(`  ${roleId}: exists, will UPDATE permissions`);
    } else {
      console.log(`  ${roleId}: exists, up-to-date`);
    }
    if (!DRY_RUN && (state.needsCreate || state.needsUpdate)) {
      const now = admin.firestore.FieldValue.serverTimestamp();
      const roleData = { ...state.expected, updatedAt: now };
      if (state.needsCreate) {
        roleData.createdAt = now;
      }
      await db.collection('roles').doc(roleId).set(roleData, { merge: true });
    }
  }
  console.log(DRY_RUN ? `[DRY RUN] ${roleIds.length} role records inspected.` : `Seeded ${roleIds.length} roles.`);
}

async function migrateUsers(db) {
  console.log(DRY_RUN ? '[DRY RUN] User migration report:' : 'Migrating users...');
  const snapshot = await db.collection('users').get();

  const stats = {
    total: snapshot.size,
    byDesignation: {},
    alreadyHaveRoleId: 0,
    willMigrate: 0,
    unknown: 0,
    unknownDesignations: new Set(),
  };

  const updates = [];

  for (const userDoc of snapshot.docs) {
    const data = userDoc.data();
    const designation = data.designation || '(missing)';
    stats.byDesignation[designation] = (stats.byDesignation[designation] || 0) + 1;

    if (data.roleId && typeof data.roleId === 'string') {
      stats.alreadyHaveRoleId++;
      continue;
    }

    const roleId = getRoleIdFromDesignation(data.designation);
    if (!roleId) {
      stats.unknown++;
      stats.unknownDesignations.add(data.designation || '(missing)');
      continue;
    }

    stats.willMigrate++;
    console.log(`  ${userDoc.id}: ${data.designation} -> ${roleId}`);
    updates.push({ ref: userDoc.ref, roleId });
  }

  if (!DRY_RUN) {
    const batch = db.batch();
    for (const update of updates) {
      batch.update(update.ref, { roleId: update.roleId });
    }
    if (updates.length > 0) {
      await batch.commit();
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Total users: ${stats.total}`);
  console.log('  Users per designation:', stats.byDesignation);
  console.log(`  Already have roleId: ${stats.alreadyHaveRoleId}`);
  console.log(`  ${DRY_RUN ? 'Will be migrated' : 'Migrated'}: ${stats.willMigrate}`);
  console.log(`  Unknown/unmapped designations: ${stats.unknown}`);
  if (stats.unknownDesignations.size > 0) {
    console.log(`  Unknown designation values: ${Array.from(stats.unknownDesignations).join(', ')}`);
  }
  console.log(DRY_RUN ? '[DRY RUN] No data was modified.' : 'User migration complete.');
}

async function main() {
  if (DRY_RUN) {
    console.log('=== DRY RUN MODE ===');
    console.log('No Firestore documents will be created, updated, or deleted.');
    console.log('');
  }

  admin.initializeApp();
  const db = admin.firestore();

  await seedRoles(db);
  console.log('');
  await migrateUsers(db);

  console.log(DRY_RUN ? 'Dry run completed.' : 'RBAC migration finished successfully.');
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}
