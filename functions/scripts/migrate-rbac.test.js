const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Tests for the direct-permission migration. The migration copies each user's
 * CURRENT effective access (role permissions + permissionOverrides) into
 * users/{uid}.permissions, removes permissionOverrides, stamps a migration
 * marker, and only then strips permissions from role documents.
 */

function loadModule(dryRun = false) {
  process.argv = dryRun
    ? ['node', 'migrate-rbac.js', '--dry-run']
    : ['node', 'migrate-rbac.js'];
  delete require.cache[require.resolve('./migrate-rbac')];
  return require('./migrate-rbac');
}

const FIELD_VALUE_DELETE = 'FIELD_VALUE_DELETE';

// migrate-rbac requires firebase-admin at module load; stub it.
const adminPath = require.resolve('firebase-admin', {
  paths: [require('node:path').join(__dirname, '..')],
});
require.cache[adminPath] = {
  exports: {
    firestore: Object.assign(() => ({}), {
      FieldValue: { delete: () => FIELD_VALUE_DELETE, serverTimestamp: () => 'TS' },
    }),
    initializeApp: () => {},
  },
};

const BM_ROLE_PERMS = {
  employees: {
    accessMode: 'custom',
    items: {
      employeeManagement: { actions: ['view', 'edit'] },
      shiftAssignment: { actions: ['view', 'add', 'edit', 'delete'] },
    },
  },
  shifts: { accessMode: 'custom', items: { shifts: { actions: ['view', 'edit'] } } },
};

const DIRECTOR_PERMS = Object.fromEntries(
  ['employees', 'attendanceLogs', 'shifts', 'leaves', 'reports', 'insights', 'devices', 'masters', 'dms', 'users']
    .map((m) => [m, { accessMode: 'full' }])
);

function createMockDb({ roles = {}, users = [] } = {}) {
  const userDocs = users.map((u) => ({
    id: u.id,
    data: () => u.data,
    ref: {
      id: u.id,
      __updates: [],
      update: async function (data) { this.__updates.push(data); },
    },
  }));
  const roleDocs = roles.map((r) => ({
    id: r.id,
    exists: true,
    data: () => r.data,
    ref: {
      id: r.id,
      __updates: [],
      update: async function (data) { this.__updates.push(data); },
    },
  }));

  return {
    userDocs,
    roleDocs,
    collection(name) {
      if (name === 'users') {
        return { get: async () => ({ docs: userDocs, size: userDocs.length }) };
      }
      if (name === 'roles') {
        return {
          get: async () => ({ docs: roleDocs, size: roleDocs.length }),
          doc: (id) => {
            const d = roleDocs.find((r) => r.id === id);
            return {
              get: async () => d || { exists: false, data: () => undefined },
            };
          },
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
}

describe('migrate-rbac effective permission computation', () => {
  it('copies custom role permissions through unchanged', () => {
    const { getEffectivePermissions } = loadModule(true);
    const effective = getEffectivePermissions(BM_ROLE_PERMS, null);
    assert.deepEqual(effective, BM_ROLE_PERMS);
  });

  it('an allow override grants an action the role denies', () => {
    const { getEffectivePermissions } = loadModule(true);
    const effective = getEffectivePermissions(BM_ROLE_PERMS, {
      employees: { employeeManagement: { delete: 'allow' } },
    });
    assert.ok(effective.employees.items.employeeManagement.actions.includes('delete'));
  });

  it('a deny override removes a role-granted action', () => {
    const { getEffectivePermissions } = loadModule(true);
    const effective = getEffectivePermissions(BM_ROLE_PERMS, {
      employees: { shiftAssignment: { delete: 'deny' } },
    });
    assert.ok(!effective.employees.items.shiftAssignment.actions.includes('delete'));
    assert.ok(effective.employees.items.shiftAssignment.actions.includes('view'));
  });

  it('full role + deny override materializes Custom over all defined actions', () => {
    const { getEffectivePermissions } = loadModule(true);
    const effective = getEffectivePermissions(DIRECTOR_PERMS, {
      employees: { employeeManagement: { delete: 'deny' } },
    });
    assert.equal(effective.employees.accessMode, 'custom');
    assert.deepEqual(effective.employees.items.employeeManagement.actions, ['view', 'add', 'edit']);
    assert.deepEqual(effective.employees.items.shiftAssignment.actions, ['view', 'add', 'edit', 'delete']);
    // Untouched modules stay full, preserving future-item semantics.
    assert.equal(effective.dms.accessMode, 'full');
  });

  it('an allow override creates access on a module the role lacks', () => {
    const { getEffectivePermissions } = loadModule(true);
    const effective = getEffectivePermissions(BM_ROLE_PERMS, {
      dms: { whatsappMessenger: { send: 'allow' } },
    });
    assert.equal(effective.dms.accessMode, 'custom');
    assert.deepEqual(effective.dms.items.whatsappMessenger.actions, ['send']);
  });

  it('normalizes access overrides to view', () => {
    const { getEffectivePermissions } = loadModule(true);
    const role = { dms: { accessMode: 'custom', items: { whatsappMessenger: { actions: ['access'] } } } };
    const effective = getEffectivePermissions(role, { dms: { whatsappMessenger: { view: 'deny' } } });
    assert.equal(effective.dms, undefined);
  });

  it('returns empty permissions when no role resolves and no overrides exist', () => {
    const { getEffectivePermissions } = loadModule(true);
    assert.deepEqual(getEffectivePermissions({}, null), {});
    assert.deepEqual(getEffectivePermissions(null, null), {});
  });
});

/**
 * Replicates the pre-migration effective check: an explicit override state
 * ('allow'/'deny', looked up by normalized action) wins; otherwise the role
 * permission tree decides via modulePermissionCheck semantics.
 */
function oldEffectiveCheck(rolePermissions, overrides, module, item, action) {
  const normalized = action === 'access' ? 'view' : action;
  const state =
    overrides && overrides[module] && overrides[module][item]
      ? overrides[module][item][normalized]
      : undefined;
  if (state === 'allow') return true;
  if (state === 'deny') return false;
  const modulePerms = rolePermissions ? rolePermissions[module] : undefined;
  if (!modulePerms) return false;
  if (modulePerms.accessMode === 'full') return true;
  const itemPerms = modulePerms.items ? modulePerms.items[item] : undefined;
  if (!itemPerms || !Array.isArray(itemPerms.actions)) return false;
  return itemPerms.actions.some((a) => (a === 'access' ? 'view' : a) === normalized);
}

/**
 * The migration invariant: for every module/item/action, the materialized
 * direct permission tree must answer identically to the old effective check.
 */
function assertEquivalent(rolePermissions, overrides) {
  const { getEffectivePermissions, checkDirectPermission, PERMISSION_MODULES } = loadModule(true);
  const effective = getEffectivePermissions(rolePermissions, overrides);
  for (const moduleDef of PERMISSION_MODULES) {
    for (const itemDef of moduleDef.items) {
      for (const action of itemDef.actions) {
        const oldResult = oldEffectiveCheck(rolePermissions, overrides, moduleDef.key, itemDef.key, action);
        const newResult = checkDirectPermission(effective, moduleDef.key, itemDef.key, action);
        assert.equal(
          newResult,
          oldResult,
          `mismatch at ${moduleDef.key}.${itemDef.key}.${action}: old=${oldResult} new=${newResult}`
        );
      }
    }
  }
}

describe('migrate-rbac effective permission equivalence', () => {
  it('role full + user deny materializes custom minus denied actions', () => {
    assertEquivalent(DIRECTOR_PERMS, {
      employees: { employeeManagement: { delete: 'deny' } },
    });
  });

  it('role custom + user allow grants actions the role lacks', () => {
    assertEquivalent(BM_ROLE_PERMS, {
      employees: { employeeManagement: { delete: 'allow', add: 'allow' } },
    });
  });

  it('role custom + user deny removes role-granted actions', () => {
    assertEquivalent(BM_ROLE_PERMS, {
      employees: { shiftAssignment: { delete: 'deny' }, employeeManagement: { edit: 'deny' } },
    });
  });

  it('role no-access + user allow creates custom access', () => {
    assertEquivalent(BM_ROLE_PERMS, {
      dms: { whatsappMessenger: { send: 'allow', manage: 'allow' } },
    });
  });

  it('multiple overrides in the same module are all applied', () => {
    assertEquivalent(DIRECTOR_PERMS, {
      leaves: {
        leaves: { delete: 'deny' },
        weekOffs: { add: 'deny', delete: 'deny' },
        leaveLimits: { view: 'deny', add: 'deny', edit: 'deny', delete: 'deny' },
      },
      shifts: { shifts: { view: 'deny' } },
    });
  });

  it('full access with several denied actions materializes correctly', () => {
    assertEquivalent(DIRECTOR_PERMS, {
      employees: {
        employeeManagement: { delete: 'deny', add: 'deny' },
        shiftAssignment: { view: 'deny', add: 'deny', edit: 'deny', delete: 'deny' },
      },
    });
  });

  it('users with no overrides keep the role grant verbatim', () => {
    assertEquivalent(BM_ROLE_PERMS, null);
    assertEquivalent(DIRECTOR_PERMS, null);
    assertEquivalent({}, null);
    assertEquivalent(null, null);
  });

  it('mixed allow and deny overrides resolve independently', () => {
    assertEquivalent(BM_ROLE_PERMS, {
      employees: { employeeManagement: { delete: 'allow', edit: 'deny' } },
      shifts: { shifts: { add: 'allow', view: 'deny' } },
      reports: { monthlyReport: { export: 'allow' } },
    });
  });
});

describe('migrate-rbac user migration', () => {
  it('writes direct permissions, removes overrides, and stamps the marker', async () => {
    const { migrateUsers, MIGRATION_VERSION } = loadModule(false);
    const db = createMockDb({
      roles: [{ id: 'branch-manager', data: { name: 'Branch Manager', permissions: BM_ROLE_PERMS } }],
      users: [
        {
          id: 'u1',
          data: {
            roleId: 'branch-manager',
            designation: 'Branch Manager',
            permissionOverrides: { employees: { employeeManagement: { delete: 'allow' } } },
          },
        },
      ],
    });

    await migrateUsers(db);

    const update = db.userDocs[0].ref.__updates[0];
    assert.ok(update.permissions.employees.items.employeeManagement.actions.includes('delete'));
    assert.equal(update.permissionOverrides, FIELD_VALUE_DELETE);
    assert.equal(update.permissionMigrationVersion, MIGRATION_VERSION);
  });

  it('skips already-migrated users so post-migration edits survive reruns', async () => {
    const { migrateUsers, MIGRATION_VERSION } = loadModule(false);
    const custom = { employees: { accessMode: 'custom', items: { employeeManagement: { actions: ['view'] } } } };
    const db = createMockDb({
      roles: [{ id: 'branch-manager', data: { name: 'Branch Manager', permissions: BM_ROLE_PERMS } }],
      users: [
        { id: 'migrated', data: { roleId: 'branch-manager', permissions: custom, permissionMigrationVersion: MIGRATION_VERSION } },
        { id: 'pending', data: { roleId: 'branch-manager' } },
      ],
    });

    await migrateUsers(db);

    assert.equal(db.userDocs[0].ref.__updates.length, 0, 'migrated user untouched');
    assert.equal(db.userDocs[1].ref.__updates.length, 1, 'pending user migrated');
    assert.deepEqual(db.userDocs[1].ref.__updates[0].permissions, BM_ROLE_PERMS);
  });

  it('preserves an existing direct permissions field verbatim — no union with legacy effective', async () => {
    const { migrateUsers } = loadModule(false);
    // User already on the direct model but unmarked: role Full + deny Delete
    // must NOT resurrect Delete via a union with the direct tree.
    const direct = { employees: { accessMode: 'custom', items: { employeeManagement: { actions: ['view'] } } } };
    const db = createMockDb({
      roles: [{ id: 'director', data: { name: 'Director', permissions: DIRECTOR_PERMS } }],
      users: [
        {
          id: 'u1',
          data: {
            roleId: 'director',
            permissions: direct,
            permissionOverrides: { employees: { employeeManagement: { delete: 'deny' } } },
          },
        },
      ],
    });
    await migrateUsers(db);
    const update = db.userDocs[0].ref.__updates[0];
    assert.deepEqual(update.permissions, direct);
    assert.equal(update.permissionOverrides, FIELD_VALUE_DELETE);
  });

  it('a role doc with a null permissions field yields no access (not defaults)', async () => {
    const { migrateUsers } = loadModule(false);
    const db = createMockDb({
      roles: [{ id: 'branch-manager', data: { name: 'Branch Manager', permissions: null } }],
      users: [{ id: 'u1', data: { roleId: 'branch-manager' } }],
    });
    await migrateUsers(db);
    assert.deepEqual(db.userDocs[0].ref.__updates[0].permissions, {});
  });

  it('falls back to built-in role defaults when the role document is missing', async () => {
    const { migrateUsers } = loadModule(false);
    const db = createMockDb({
      roles: [],
      users: [{ id: 'u1', data: { roleId: 'branch-manager', designation: 'Branch Manager' } }],
    });
    await migrateUsers(db);
    assert.equal(db.userDocs[0].ref.__updates[0].permissions.shifts.accessMode, 'custom');
  });

  it('dry-run performs no writes', async () => {
    // Re-require with the dry-run flag so DRY_RUN is true inside the module.
    const { migrateUsers, cleanupRolePermissions } = loadModule(true);
    const db = createMockDb({
      roles: [{ id: 'hr', data: { name: 'HR', permissions: {} } }],
      users: [{ id: 'u1', data: { roleId: 'hr', designation: 'HR' } }],
    });
    await migrateUsers(db);
    await cleanupRolePermissions(db, true);
    assert.equal(db.userDocs[0].ref.__updates.length, 0);
    assert.equal(db.roleDocs[0].ref.__updates.length, 0);
  });
});

describe('migrate-rbac role cleanup ordering', () => {
  it('removes the permissions field from roles only after all users migrated', async () => {
    const { cleanupRolePermissions } = loadModule(false);
    const db = createMockDb({
      roles: [
        { id: 'hr', data: { name: 'HR', permissions: { x: 1 } } },
        { id: 'director', data: { name: 'Director' } },
      ],
    });
    await cleanupRolePermissions(db, true);
    assert.equal(db.roleDocs[0].ref.__updates.length, 1);
    assert.deepEqual(db.roleDocs[0].ref.__updates[0], { permissions: FIELD_VALUE_DELETE });
    assert.equal(db.roleDocs[1].ref.__updates.length, 0, 'role without permissions untouched');
  });

  it('refuses cleanup while unmigrated users remain', async () => {
    const { cleanupRolePermissions } = loadModule(false);
    const db = createMockDb({
      roles: [{ id: 'hr', data: { name: 'HR', permissions: { x: 1 } } }],
    });
    await cleanupRolePermissions(db, false);
    assert.equal(db.roleDocs[0].ref.__updates.length, 0);
  });
});
