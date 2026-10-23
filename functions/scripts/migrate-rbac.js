/**
 * One-time migration from role+override permissions to direct user permissions.
 *
 * For every user document it:
 *   1. Computes the user's CURRENT effective permissions
 *      (role permissions merged with permissionOverrides, exactly matching the
 *      pre-migration frontend/backend resolution).
 *   2. Writes `permissions` to the materialized effective grant set. If the
 *      document already carries a `permissions` field it is preserved verbatim
 *      (that field is already the direct-model source of truth); the computed
 *      legacy effective set is NEVER unioned into it, since the old model did
 *      not consult `permissions` and unioning could resurrect denied actions.
 *   3. Deletes `permissionOverrides` and stamps `permissionMigrationVersion`
 *      atomically.
 *
 * After ALL users are migrated, it removes the `permissions` field from every
 * role document (roles remain as identity/administrative records only).
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
 * Idempotent: users carrying `permissionMigrationVersion` are skipped, so
 * post-migration user edits are never overwritten. If a run is interrupted,
 * rerunning resumes the unmigrated users; role cleanup only happens once no
 * unmigrated users remain, so the role-permission source survives partial runs.
 */

const admin = require('firebase-admin');
const adminAuth = require('./lib/adminAuth');

const DRY_RUN = process.argv.includes('--dry-run');
const MIGRATION_VERSION = 1;

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

// Mirrors src/permissions/definitions.ts — the authoritative action catalog.
const PERMISSION_MODULES = [
  { key: 'employees', items: [
    { key: 'employeeManagement', actions: ['view', 'add', 'edit', 'delete'] },
    { key: 'shiftAssignment', actions: ['view', 'add', 'edit', 'delete'] },
  ] },
  { key: 'attendanceLogs', items: [
    { key: 'rawPunches', actions: ['view', 'add', 'edit', 'delete'] },
    { key: 'changeTracker', actions: ['view', 'add', 'edit', 'delete'] },
  ] },
  { key: 'shifts', items: [
    { key: 'shifts', actions: ['view', 'add', 'edit', 'delete'] },
  ] },
  { key: 'leaves', items: [
    { key: 'leaves', actions: ['view', 'add', 'edit', 'delete'] },
    { key: 'weekOffs', actions: ['view', 'add', 'edit', 'delete'] },
    { key: 'leaveLimits', actions: ['view', 'add', 'edit', 'delete'] },
  ] },
  { key: 'reports', items: [
    { key: 'monthlyReport', actions: ['view', 'export'] },
    { key: 'dailyReport', actions: ['view', 'export'] },
    { key: 'shiftReport', actions: ['view', 'export'] },
    { key: 'employeeMasterReport', actions: ['view', 'export'] },
  ] },
  { key: 'insights', items: [
    { key: 'insights', actions: ['view'] },
  ] },
  { key: 'devices', items: [
    { key: 'devices', actions: ['view', 'add', 'edit', 'delete'] },
  ] },
  { key: 'masters', items: [
    { key: 'branches', actions: ['view', 'add', 'edit', 'delete'] },
    { key: 'designations', actions: ['view', 'add', 'edit', 'delete'] },
    { key: 'departments', actions: ['view', 'add', 'edit', 'delete'] },
  ] },
  { key: 'dms', items: [
    { key: 'whatsappMessenger', actions: ['access', 'send', 'manage'] },
    { key: 'conversionInsights', actions: ['view'] },
    { key: 'whatsappEnquiry', actions: ['view', 'edit'] },
    { key: 'lostCustomers', actions: ['view', 'edit'] },
  ] },
  { key: 'users', items: [
    { key: 'userManagement', actions: ['view', 'add', 'edit', 'delete'] },
    { key: 'roleManagement', actions: ['view', 'edit'] },
  ] },
];

const FULL_ACCESS = Object.fromEntries(
  PERMISSION_MODULES.map((m) => [m.key, { accessMode: 'full' }])
);

const DEFAULT_ROLE_PERMISSIONS = {
  [ROLE_IDS.DIRECTOR]: FULL_ACCESS,
  [ROLE_IDS.HR]: {
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
      items: { userManagement: { actions: ['view', 'add', 'edit', 'delete'] } },
    },
  },
  [ROLE_IDS.OPERATIONS_MANAGER]: {
    dms: { accessMode: 'full' },
    users: {
      accessMode: 'custom',
      items: { userManagement: { actions: ['view', 'add', 'edit'] } },
    },
  },
  [ROLE_IDS.BRANCH_MANAGER]: {
    employees: {
      accessMode: 'custom',
      items: {
        employeeManagement: { actions: ['view', 'edit'] },
        shiftAssignment: { actions: ['view', 'add', 'edit', 'delete'] },
      },
    },
    attendanceLogs: {
      accessMode: 'custom',
      items: { rawPunches: { actions: ['view'] } },
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
  },
  [ROLE_IDS.WHATSAPP_MESSAGER]: {
    dms: { accessMode: 'full' },
  },
};

function normalizeAction(action) {
  return action === 'access' ? 'view' : action;
}

function getRoleIdFromDesignation(designation) {
  if (!designation) return '';
  const normalized = designation.trim().toLowerCase();
  switch (normalized) {
    case 'director': return ROLE_IDS.DIRECTOR;
    case 'hr': return ROLE_IDS.HR;
    case 'operations manager': return ROLE_IDS.OPERATIONS_MANAGER;
    case 'branch manager': return ROLE_IDS.BRANCH_MANAGER;
    case 'whatsapp messager': return ROLE_IDS.WHATSAPP_MESSAGER;
    default: return '';
  }
}

/**
 * Replicates the pre-migration frontend/backend effective resolution:
 * explicit user overrides on top of role permissions.
 *
 * - Role 'full' stays 'full' unless deny overrides exist, in which case it is
 *   materialized as 'custom' over all currently defined actions minus denies.
 * - Overrides can grant actions on modules the role lacks entirely.
 */
function getEffectivePermissions(rolePermissions, overrides) {
  if (!rolePermissions && !overrides) return {};
  const effective = {};

  for (const moduleDef of PERMISSION_MODULES) {
    const roleModule = rolePermissions ? rolePermissions[moduleDef.key] : undefined;
    const moduleOverride = overrides ? overrides[moduleDef.key] : undefined;
    if (!roleModule && !moduleOverride) continue;

    if (roleModule && roleModule.accessMode === 'full') {
      const denied = new Set();
      if (moduleOverride) {
        for (const [itemKey, itemOverride] of Object.entries(moduleOverride)) {
          if (!itemOverride) continue;
          for (const [action, state] of Object.entries(itemOverride)) {
            if (state === 'deny') denied.add(`${itemKey}.${action}`);
          }
        }
      }
      if (denied.size === 0) {
        effective[moduleDef.key] = { accessMode: 'full' };
        continue;
      }
      const items = {};
      for (const itemDef of moduleDef.items) {
        const actions = itemDef.actions.filter(
          (a) => !denied.has(`${itemDef.key}.${normalizeAction(a)}`)
        );
        if (actions.length > 0) items[itemDef.key] = { actions };
      }
      if (Object.keys(items).length > 0) {
        effective[moduleDef.key] = { accessMode: 'custom', items };
      }
      continue;
    }

    const items = {};
    for (const itemDef of moduleDef.items) {
      const roleItem = roleModule && roleModule.items ? roleModule.items[itemDef.key] : undefined;
      const itemOverride = moduleOverride ? moduleOverride[itemDef.key] : undefined;
      const actions = [];
      for (const action of itemDef.actions) {
        const normalized = normalizeAction(action);
        const state = itemOverride ? itemOverride[normalized] : undefined;
        if (state === 'allow') {
          actions.push(action);
        } else if (state === 'deny') {
          // excluded
        } else if (
          roleItem &&
          Array.isArray(roleItem.actions) &&
          roleItem.actions.some((a) => normalizeAction(a) === normalized)
        ) {
          actions.push(action);
        }
      }
      if (actions.length > 0) items[itemDef.key] = { actions };
    }
    if (Object.keys(items).length > 0) {
      effective[moduleDef.key] = { accessMode: 'custom', items };
    }
  }

  return effective;
}

/**
 * Checks a module/item/action against a materialized direct permission tree,
 * mirroring functions/src/permissions.ts evaluateUserPermission and the
 * modulePermissionCheck helper in firestore.rules.
 */
function checkDirectPermission(permissions, module, item, action) {
  if (!permissions) return false;
  const modulePerms = permissions[module];
  if (!modulePerms) return false;
  if (modulePerms.accessMode === 'full') return true;
  const itemPerms = modulePerms.items ? modulePerms.items[item] : undefined;
  if (!itemPerms || !Array.isArray(itemPerms.actions)) return false;
  const target = normalizeAction(action);
  return itemPerms.actions.some((a) => normalizeAction(a) === target);
}

function isMigrated(data) {
  return data.permissionMigrationVersion === MIGRATION_VERSION;
}

/**
 * Normalizes Firestore values for deep comparison. Timestamps (and similar
 * date-like objects) are converted to a canonical form; plain objects have
 * keys sorted so equality is structural rather than key-order dependent.
 */
function normalizeValue(value) {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (typeof value.toMillis === 'function') return { __ts: value.toMillis() };
  if (typeof value._seconds === 'number' && typeof value._nanoseconds === 'number') {
    return { __ts: value._seconds * 1000 + Math.floor(value._nanoseconds / 1e6) };
  }
  if (value instanceof Date) return { __ts: value.getTime() };
  if (Array.isArray(value)) return value.map(normalizeValue);
  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    normalized[key] = normalizeValue(value[key]);
  }
  return normalized;
}

function deepEqual(a, b) {
  return JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));
}

async function resolveRolePermissions(db, userData, roleCache) {
  const roleId =
    (typeof userData.roleId === 'string' && userData.roleId) ||
    getRoleIdFromDesignation(userData.designation);
  if (!roleId) return {};
  if (!roleCache.has(roleId)) {
    const snapshot = await db.collection('roles').doc(roleId).get();
    const data = snapshot.exists ? snapshot.data() : undefined;
    // Mirrors the pre-migration hasRolePermission rule: a role document that
    // HAS a permissions field (even null) is authoritative; the built-in
    // defaults only apply when the field/document is absent (legacy fallback).
    const permissions = data && 'permissions' in data
      ? (data.permissions || {})
      : (DEFAULT_ROLE_PERMISSIONS[roleId] || {});
    roleCache.set(roleId, permissions);
  }
  return roleCache.get(roleId);
}

/**
 * Computes the migration update for one user document. Returns null when the
 * user is already migrated. Pure aside from the role-permission lookup.
 */
async function computeUserUpdate(db, userDoc, roleCache) {
  const data = userDoc.data();
  if (isMigrated(data)) return null;

  const rolePermissions = await resolveRolePermissions(db, data, roleCache);
  const overrides = data.permissionOverrides || null;
  const legacyEffective = getEffectivePermissions(rolePermissions, overrides);
  // A doc that already carries `permissions` is already on the direct model
  // (e.g. users created after the refactor). Keep it verbatim — the legacy
  // effective set must not be unioned into it, or explicitly denied actions
  // could be resurrected.
  const permissions =
    data.permissions && typeof data.permissions === 'object' ? data.permissions : legacyEffective;

  const update = {
    permissions,
    permissionOverrides: admin.firestore.FieldValue.delete(),
    permissionMigrationVersion: MIGRATION_VERSION,
  };
  return { update, permissions, roleId: data.roleId || getRoleIdFromDesignation(data.designation) || '(none)' };
}

async function migrateUsers(db) {
  console.log(DRY_RUN ? '[DRY RUN] User permission migration report:' : 'Migrating user permissions...');
  const snapshot = await db.collection('users').get();
  const roleCache = new Map();

  const stats = {
    total: snapshot.size,
    alreadyMigrated: 0,
    willMigrate: 0,
    withOverrides: 0,
    noResolvableRole: 0,
  };

  const pending = [];
  // Manifest for post-write verification: every user in scope, with the exact
  // expected permissions and a snapshot of the pre-write document.
  const manifest = new Map();

  for (const userDoc of snapshot.docs) {
    const data = userDoc.data();
    if (isMigrated(data)) {
      stats.alreadyMigrated++;
      // Already-migrated direct permissions must survive unchanged.
      manifest.set(userDoc.id, { before: data, expected: data.permissions || {} });
      continue;
    }
    const result = await computeUserUpdate(db, userDoc, roleCache);
    if (!result) continue;
    stats.willMigrate++;
    if (data.permissionOverrides) stats.withOverrides++;
    if (result.roleId === '(none)') stats.noResolvableRole++;
    pending.push({ ref: userDoc.ref, id: userDoc.id, update: result.update });
    manifest.set(userDoc.id, { before: data, expected: result.permissions });
    console.log(`  ${userDoc.id}: role=${result.roleId} -> ${Object.keys(result.permissions).length} module(s) granted`);
  }

  if (!DRY_RUN) {
    for (const p of pending) {
      await p.ref.update(p.update);
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Total users: ${stats.total}`);
  console.log(`  Already migrated: ${stats.alreadyMigrated}`);
  console.log(`  ${DRY_RUN ? 'Will migrate' : 'Migrated'}: ${stats.willMigrate}`);
  console.log(`  Users with overrides folded in: ${stats.withOverrides}`);
  console.log(`  Users without resolvable role (permissions = computed overrides only): ${stats.noResolvableRole}`);
  return { allMigrated: stats.willMigrate + stats.alreadyMigrated === stats.total, manifest };
}

/**
 * Mandatory post-write gate. Re-reads every user document and verifies:
 *   - the document still exists (and no unexpected new users appeared),
 *   - stored permissions deep-equal the computed expected tree,
 *   - permissionMigrationVersion is stamped,
 *   - permissionOverrides is absent,
 *   - every field unrelated to the RBAC migration is byte-identical to the
 *     pre-write snapshot.
 * Returns a list of human-readable discrepancies; empty means verified.
 */
async function verifyUserMigration(db, manifest) {
  const RBAC_FIELDS = new Set(['permissions', 'permissionOverrides', 'permissionMigrationVersion']);
  const discrepancies = [];

  const snapshot = await db.collection('users').get();
  const byId = new Map(snapshot.docs.map((d) => [d.id, d]));

  for (const docSnap of snapshot.docs) {
    if (!manifest.has(docSnap.id)) {
      discrepancies.push(`${docSnap.id}: unexpected user document appeared during migration`);
    }
  }

  for (const [uid, entry] of manifest) {
    const docSnap = byId.get(uid);
    if (!docSnap) {
      discrepancies.push(`${uid}: user document missing after migration`);
      continue;
    }
    const after = docSnap.data();

    if (!deepEqual(after.permissions, entry.expected)) {
      discrepancies.push(`${uid}: stored permissions do not match the expected effective set`);
    }
    if (after.permissionMigrationVersion !== MIGRATION_VERSION) {
      discrepancies.push(`${uid}: missing or incorrect permissionMigrationVersion`);
    }
    if ('permissionOverrides' in after) {
      discrepancies.push(`${uid}: permissionOverrides field still present`);
    }

    const fieldKeys = new Set([...Object.keys(entry.before), ...Object.keys(after)]);
    for (const key of fieldKeys) {
      if (RBAC_FIELDS.has(key)) continue;
      if (!deepEqual(entry.before[key], after[key])) {
        discrepancies.push(`${uid}: unrelated field '${key}' changed during migration`);
      }
    }
  }

  return discrepancies;
}

async function cleanupRolePermissions(db, allUsersMigrated) {
  if (!allUsersMigrated) {
    console.log('');
    console.log('Skipping role permission cleanup: unmigrated users still depend on role permission data.');
    return;
  }
  console.log(DRY_RUN ? '[DRY RUN] Role permission cleanup report:' : 'Removing permissions field from role documents...');
  const snapshot = await db.collection('roles').get();
  let cleaned = 0;
  const cleanedIds = [];
  for (const roleDoc of snapshot.docs) {
    const data = roleDoc.data();
    if (!('permissions' in data)) continue;
    cleaned++;
    console.log(`  ${roleDoc.id}: permissions field will be removed`);
    if (!DRY_RUN) {
      await roleDoc.ref.update({ permissions: admin.firestore.FieldValue.delete() });
      cleanedIds.push(roleDoc.id);
    }
  }
  console.log(`  ${DRY_RUN ? 'Would clean' : 'Cleaned'} ${cleaned} role document(s).`);

  // Post-cleanup verification: re-read and confirm the field is gone.
  if (!DRY_RUN) {
    const verify = await db.collection('roles').get();
    const failures = [];
    for (const roleDoc of verify.docs) {
      if ('permissions' in roleDoc.data()) failures.push(roleDoc.id);
    }
    if (failures.length > 0) {
      throw new Error(`Role permission cleanup verification failed; still present on: ${failures.join(', ')}`);
    }
    if (cleanedIds.length > 0) console.log(`  Verified removed from: ${cleanedIds.join(', ')}`);
  }
}

/**
 * Initializes firebase-admin. Prefers a service account via
 * GOOGLE_APPLICATION_CREDENTIALS; otherwise falls back to the firebase CLI's
 * stored refresh token (see scripts/lib/adminAuth.js).
 */
function initAdmin() {
  adminAuth.initAdmin('migrate-rbac-adc.json');
}

async function main() {
  if (DRY_RUN) {
    console.log('=== DRY RUN MODE ===');
    console.log('No Firestore documents will be created, updated, or deleted.');
    console.log('');
  }

  initAdmin();
  const db = admin.firestore();

  const { allMigrated, manifest } = await migrateUsers(db);

  if (!DRY_RUN) {
    console.log('');
    console.log('Verifying migrated user documents...');
    const discrepancies = await verifyUserMigration(db, manifest);
    if (discrepancies.length > 0) {
      console.error('USER VERIFICATION FAILED — role permission cleanup aborted:');
      for (const d of discrepancies) console.error(`  - ${d}`);
      process.exit(1);
    }
    console.log(`  Verified ${manifest.size} user document(s).`);
  }

  // In dry-run mode the pending migrations are assumed to succeed so the
  // role-cleanup report reflects the complete plan.
  await cleanupRolePermissions(db, DRY_RUN || allMigrated);

  console.log(DRY_RUN ? 'Dry run completed.' : 'Direct-permission migration finished successfully.');
  process.exit(0);
}

module.exports = {
  ROLE_IDS,
  ROLE_NAMES,
  PERMISSION_MODULES,
  DEFAULT_ROLE_PERMISSIONS,
  MIGRATION_VERSION,
  normalizeAction,
  getRoleIdFromDesignation,
  getEffectivePermissions,
  checkDirectPermission,
  deepEqual,
  computeUserUpdate,
  migrateUsers,
  verifyUserMigration,
  cleanupRolePermissions,
};

if (require.main === module) {
  main().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}
