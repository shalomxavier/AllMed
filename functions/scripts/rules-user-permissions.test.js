const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');

/**
 * Firestore rules regression tests for direct user permissions.
 *
 * Authorization model: users/{uid}.permissions is the ONLY source of
 * module/action access. roleId/designation still gate administrative scope
 * (branch-manager branch restriction, who may assign roles/permissions).
 *
 * Run against the Firestore emulator:
 *   firebase emulators:exec --only firestore --project demo-allmed-rules \
 *     "node --test functions/scripts/rules-user-permissions.test.js"
 */

// Distinct projectId per test file so parallel `node --test` files don't share
// emulator data (each initializeTestEnvironment uploads rules per project).
const PROJECT_ID = 'demo-allmed-user-permissions';
const RULES = fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
const EMULATOR_AVAILABLE = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

const FULL = {
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

const BM_A_PERMS = {
  employees: {
    accessMode: 'custom',
    items: {
      employeeManagement: { actions: ['view', 'edit'] },
      shiftAssignment: { actions: ['view', 'add', 'edit', 'delete'] },
    },
  },
  leaves: {
    accessMode: 'custom',
    items: {
      leaves: { actions: ['view', 'add', 'edit', 'delete'] },
    },
  },
};

const BM_B_PERMS = {
  employees: {
    accessMode: 'custom',
    items: {
      employeeManagement: { actions: ['view', 'edit', 'delete'] },
      shiftAssignment: { actions: ['view'] },
    },
  },
};

const HR_PERMS = {
  ...FULL,
  users: {
    accessMode: 'custom',
    items: { userManagement: { actions: ['view', 'add', 'edit', 'delete'] } },
  },
};

let testEnv;

const dbFor = (uid) => testEnv.authenticatedContext(uid).firestore();

before(async () => {
  if (!EMULATOR_AVAILABLE) return;
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES },
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'dir'), {
      roleId: 'director', designation: 'Director', name: 'Dir', permissions: FULL,
    });
    await setDoc(doc(db, 'users', 'hr'), {
      roleId: 'hr', designation: 'HR', name: 'HR', permissions: HR_PERMS,
    });
    await setDoc(doc(db, 'users', 'bmA'), {
      roleId: 'branch-manager', designation: 'Branch Manager', name: 'BM A', permissions: BM_A_PERMS,
    });
    await setDoc(doc(db, 'users', 'bmB'), {
      roleId: 'branch-manager', designation: 'Branch Manager', name: 'BM B', permissions: BM_B_PERMS,
    });
    await setDoc(doc(db, 'users', 'no-perms'), {
      roleId: 'hr', designation: 'HR', name: 'No Perms',
    });
    await setDoc(doc(db, 'employees', 'e1'), { employeeCode: 'E001', employeeName: 'Emp One', branchId: 'b1' });
    await setDoc(doc(db, 'employees', 'e-del'), { employeeCode: 'E002', employeeName: 'Emp Two', branchId: 'b1' });
    await setDoc(doc(db, 'employees', 'e-del-2'), { employeeCode: 'E003', employeeName: 'Emp Three', branchId: 'b1' });
    await setDoc(doc(db, 'employees', 'e-del-3'), { employeeCode: 'E004', employeeName: 'Emp Four', branchId: 'b1' });
    await setDoc(doc(db, 'branches', 'b1'), { name: 'Branch 1', managerId: 'bmA', employeeIds: ['e1'], shiftIds: [] });
    await setDoc(doc(db, 'branches', 'b2'), { name: 'Branch 2', managerId: 'bmB', employeeIds: ['e1'], shiftIds: [] });
    await setDoc(doc(db, 'leaves', 'in-scope'), { type: 'leave', branchId: 'b1', employeeId: 'e1' });
    await setDoc(doc(db, 'leaves', 'out-of-scope'), { type: 'leave', branchId: 'b9', employeeId: 'e9' });
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

describe('direct user permissions in rules', { skip: !EMULATOR_AVAILABLE && 'requires the Firestore emulator' }, () => {
  it('two users with the same role can have different permission outcomes', async () => {
    // bmA lacks employeeManagement.delete; bmB has it — same roleId.
    await assertFails(deleteDoc(doc(dbFor('bmA'), 'employees', 'e-del')));
    await assertSucceeds(deleteDoc(doc(dbFor('bmB'), 'employees', 'e-del')));
  });

  it('a user with no permissions field is denied everything', async () => {
    await assertFails(updateDoc(doc(dbFor('no-perms'), 'employees', 'e1'), { employeeName: 'X' }));
    await assertFails(deleteDoc(doc(dbFor('no-perms'), 'employees', 'e-del-2')));
  });

  it('full accessMode grants every defined action', async () => {
    // dir's employees module is accessMode 'full'.
    await assertSucceeds(deleteDoc(doc(dbFor('dir'), 'employees', 'e-del-2')));
  });

  it('custom mode grants only listed actions', async () => {
    await assertSucceeds(updateDoc(doc(dbFor('bmA'), 'employees', 'e1'), { employeeName: 'BM A edit' }));
    await assertFails(deleteDoc(doc(dbFor('bmA'), 'employees', 'e1')));
  });

  it('changing a user\'s role does not change their permissions', async () => {
    // Flip bmB's roleId to 'hr' with rules disabled; their stored permissions
    // still apply, so employeeManagement.delete keeps working.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', 'bmB'), { roleId: 'hr', designation: 'HR' });
    });
    await assertSucceeds(deleteDoc(doc(dbFor('bmB'), 'employees', 'e-del-3')));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', 'bmB'), { roleId: 'branch-manager', designation: 'Branch Manager' });
    });
  });
});

describe('user document write protections', { skip: !EMULATOR_AVAILABLE && 'requires the Firestore emulator' }, () => {
  it('prevents a user from modifying their own permissions', async () => {
    await assertFails(updateDoc(doc(dbFor('bmA'), 'users', 'bmA'), {
      permissions: { employees: { accessMode: 'full' } },
    }));
  });

  it('prevents a user from changing their own roleId', async () => {
    await assertFails(updateDoc(doc(dbFor('bmA'), 'users', 'bmA'), { roleId: 'director' }));
    await assertFails(updateDoc(doc(dbFor('hr'), 'users', 'hr'), { roleId: 'director' }));
  });

  it('allows the permission-management authority to set another user\'s permissions', async () => {
    await assertSucceeds(updateDoc(doc(dbFor('dir'), 'users', 'no-perms'), {
      permissions: { employees: { accessMode: 'custom', items: { employeeManagement: { actions: ['view'] } } } },
    }));
  });

  it('denies non-authority admins from changing another user\'s roleId or permissions', async () => {
    await assertFails(updateDoc(doc(dbFor('hr'), 'users', 'bmA'), { roleId: 'hr' }));
    await assertFails(updateDoc(doc(dbFor('hr'), 'users', 'bmA'), {
      permissions: { employees: { accessMode: 'full' } },
    }));
    // But HR can still edit non-protected fields.
    await assertSucceeds(updateDoc(doc(dbFor('hr'), 'users', 'bmA'), { name: 'BM Renamed' }));
  });

  it('denies non-authority admins from creating a Director or assigning permissions', async () => {
    await assertFails(setDoc(doc(dbFor('hr'), 'users', 'new-dir'), {
      name: 'N', email: 'n@x.com', roleId: 'director', designation: 'Director', branch: 'b1',
    }));
    await assertFails(setDoc(doc(dbFor('hr'), 'users', 'new-perms'), {
      name: 'N', email: 'n@x.com', roleId: 'hr', designation: 'HR', branch: 'b1',
      permissions: { employees: { accessMode: 'full' } },
    }));
    await assertSucceeds(setDoc(doc(dbFor('hr'), 'users', 'new-hr'), {
      name: 'N', email: 'n@x.com', roleId: 'hr', designation: 'HR', branch: 'b1',
    }));
  });
});

describe('branch scope stays independent of the permission source', { skip: !EMULATOR_AVAILABLE && 'requires the Firestore emulator' }, () => {
  it('a branch-manager user may act within their branch scope', async () => {
    await assertSucceeds(deleteDoc(doc(dbFor('bmA'), 'leaves', 'in-scope')));
  });

  it('a branch-manager user may not act outside their branch scope', async () => {
    await assertFails(deleteDoc(doc(dbFor('bmA'), 'leaves', 'out-of-scope')));
  });
});
