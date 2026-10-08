const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Keep a pristine reference to the real module; reload between tests to honor DRY_RUN flag changes.
function loadModule(dryRun = false) {
  // Setting argv controls the DRY_RUN constant inside migrate-rbac.js.
  if (dryRun) {
    process.argv = ['node', 'migrate-rbac.js', '--dry-run'];
  } else {
    process.argv = ['node', 'migrate-rbac.js'];
  }
  // Clear require cache so the DRY_RUN constant is re-evaluated.
  delete require.cache[require.resolve('./migrate-rbac')];
  return require('./migrate-rbac');
}

function createMockDb({ existingRoles = {}, users = [] } = {}) {
  const setCalls = [];
  const batchUpdateCalls = [];

  function makeDocRef(id) {
    return {
      id,
      set: async (data, options) => {
        setCalls.push({ id, data, options });
      },
    };
  }

  const docs = [];
  const roleDocs = {};

  for (const roleId of Object.keys(existingRoles)) {
    roleDocs[roleId] = {
      exists: true,
      data: () => existingRoles[roleId],
      ref: makeDocRef(roleId),
    };
  }

  for (const user of users) {
    const ref = makeDocRef(user.id);
    docs.push({
      id: user.id,
      data: () => user.data,
      ref,
    });
  }

  const mockBatch = {
    update: (ref, data) => {
      batchUpdateCalls.push({ ref, data });
    },
    commit: async () => {
      // no-op for mock
    },
  };

  return {
    collection(name) {
      if (name === 'roles') {
        return {
          doc(roleId) {
            return {
              get: async () => roleDocs[roleId] || { exists: false, data: () => undefined },
              set: async (data, options) => {
                setCalls.push({ id: roleId, data, options });
              },
            };
          },
        };
      }
      if (name === 'users') {
        return {
          get: async () => ({ docs, size: docs.length }),
        };
      }
      return { doc: () => ({}), get: async () => ({ docs: [], size: 0 }) };
    },
    batch: () => mockBatch,
    setCalls,
    batchUpdateCalls,
  };
}

describe('migrate-rbac role mapping', () => {
  it('maps all legacy designations to fixed roleIds', () => {
    const { getRoleIdFromDesignation, ROLE_IDS } = loadModule(true);
    assert.equal(getRoleIdFromDesignation('Director'), ROLE_IDS.DIRECTOR);
    assert.equal(getRoleIdFromDesignation('HR'), ROLE_IDS.HR);
    assert.equal(getRoleIdFromDesignation('Operations Manager'), ROLE_IDS.OPERATIONS_MANAGER);
    assert.equal(getRoleIdFromDesignation('Branch Manager'), ROLE_IDS.BRANCH_MANAGER);
    assert.equal(getRoleIdFromDesignation('WhatsApp Messager'), ROLE_IDS.WHATSAPP_MESSAGER);
  });

  it('is case-insensitive and trims whitespace', () => {
    const { getRoleIdFromDesignation, ROLE_IDS } = loadModule(true);
    assert.equal(getRoleIdFromDesignation('  hr  '), ROLE_IDS.HR);
    assert.equal(getRoleIdFromDesignation('BRANCH MANAGER'), ROLE_IDS.BRANCH_MANAGER);
  });

  it('returns empty string for unknown designations', () => {
    const { getRoleIdFromDesignation } = loadModule(true);
    assert.equal(getRoleIdFromDesignation('Admin'), '');
    assert.equal(getRoleIdFromDesignation(''), '');
    assert.equal(getRoleIdFromDesignation(undefined), '');
  });
});

describe('migrate-rbac default role permissions', () => {
  it('has exactly five fixed roles', () => {
    const { ROLE_NAMES } = loadModule(true);
    assert.equal(Object.keys(ROLE_NAMES).length, 5);
  });

  it('Director has full access on every module', () => {
    const { DEFAULT_ROLE_PERMISSIONS, ROLE_IDS } = loadModule(true);
    const perms = DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.DIRECTOR];
    assert.equal(perms.employees.accessMode, 'full');
    assert.equal(perms.dms.accessMode, 'full');
    assert.equal(perms.users.accessMode, 'full');
  });

  it('HR has full attendance/masters/users access and no DMS access', () => {
    const { DEFAULT_ROLE_PERMISSIONS, ROLE_IDS } = loadModule(true);
    const perms = DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.HR];
    assert.equal(perms.employees.accessMode, 'full');
    assert.equal(perms.dms, undefined);
    assert.ok(perms.users.items.userManagement.actions.includes('delete'));
  });

  it('Operations Manager has full DMS and limited user management', () => {
    const { DEFAULT_ROLE_PERMISSIONS, ROLE_IDS } = loadModule(true);
    const perms = DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.OPERATIONS_MANAGER];
    assert.equal(perms.dms.accessMode, 'full');
    assert.ok(!perms.users.items.userManagement.actions.includes('delete'));
    assert.equal(perms.employees, undefined);
  });

  it('Branch Manager has attendance scope without devices/masters/users/DMS', () => {
    const { DEFAULT_ROLE_PERMISSIONS, ROLE_IDS } = loadModule(true);
    const perms = DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.BRANCH_MANAGER];
    assert.equal(perms.devices, undefined);
    assert.equal(perms.masters, undefined);
    assert.equal(perms.users, undefined);
    assert.equal(perms.dms, undefined);
    assert.ok(perms.attendanceLogs.items.rawPunches.actions.includes('view'));
    assert.equal(perms.attendanceLogs.items.changeTracker, undefined);
  });

  it('WhatsApp Messager has full DMS access to preserve legacy routes', () => {
    const { DEFAULT_ROLE_PERMISSIONS, ROLE_IDS } = loadModule(true);
    const perms = DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.WHATSAPP_MESSAGER];
    assert.equal(perms.dms.accessMode, 'full');
    assert.equal(perms.employees, undefined);
    assert.equal(perms.users, undefined);
  });
});

describe('migrate-rbac idempotency and dry-run behavior', () => {
  it('dry-run does not create role documents or update users', async () => {
    const { seedRoles, migrateUsers } = loadModule(true);
    const db = createMockDb({
      users: [
        { id: 'u1', data: { designation: 'HR', name: 'Alice' } },
        { id: 'u2', data: { designation: 'Director', name: 'Bob' } },
        { id: 'u3', data: { roleId: 'hr', designation: 'HR', name: 'Carol' } },
        { id: 'u4', data: { designation: 'Unknown Role', name: 'Dave' } },
      ],
    });

    await seedRoles(db);
    await migrateUsers(db);

    assert.equal(db.setCalls.length, 0, 'No role set calls should happen in dry-run');
    assert.equal(db.batchUpdateCalls.length, 0, 'No user updates should happen in dry-run');
  });

  it('skips users that already have roleId', async () => {
    const { seedRoles, migrateUsers } = loadModule(true);
    const db = createMockDb({
      users: [
        { id: 'u1', data: { designation: 'HR', name: 'Alice' } },
        { id: 'u2', data: { roleId: 'hr', designation: 'HR', name: 'Carol' } },
      ],
    });

    await seedRoles(db);
    await migrateUsers(db);

    // u1 would be migrated; u2 already has roleId.
    assert.equal(db.batchUpdateCalls.length, 0, 'No updates in dry-run');
  });

  it('non-dry-run writes only missing roleIds and does not overwrite designation', async () => {
    const { seedRoles, migrateUsers } = loadModule(false);
    const db = createMockDb({
      users: [
        { id: 'u1', data: { designation: 'HR', name: 'Alice' } },
        { id: 'u2', data: { roleId: 'hr', designation: 'HR', name: 'Carol' } },
        { id: 'u3', data: { designation: 'Branch Manager', name: 'Eve' } },
      ],
    });

    await seedRoles(db);
    await migrateUsers(db);

    // 5 role docs created/updated + 2 user updates (u1 and u3).
    assert.equal(db.setCalls.length, 5, 'All five role documents should be seeded');
    assert.equal(db.batchUpdateCalls.length, 2, 'Only users without roleId should be updated');

    const updatedUserIds = db.batchUpdateCalls.map((c) => c.ref.id).sort();
    assert.deepEqual(updatedUserIds, ['u1', 'u3']);

    const u1Update = db.batchUpdateCalls.find((c) => c.ref.id === 'u1');
    assert.equal(u1Update.data.roleId, 'hr');
    assert.equal(u1Update.data.designation, undefined, 'designation must not be modified');
  });

  it('does not create duplicate role records', async () => {
    const { seedRoles } = loadModule(false);
    const existingRoles = {
      hr: { name: 'HR', permissions: {} },
    };
    const db = createMockDb({ existingRoles });

    await seedRoles(db);

    // Exactly five set calls (one per fixed role), not duplicates for existing roles.
    assert.equal(db.setCalls.length, 5);
    const hrCalls = db.setCalls.filter((c) => c.id === 'hr');
    assert.equal(hrCalls.length, 1, 'HR role should be updated once, not duplicated');
  });
});
