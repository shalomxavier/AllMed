const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');

/**
 * Firestore rules regression tests for the shifts collection.
 *
 * Guards the residual gap where a branch-manager holding shifts.shifts.edit
 * could rewrite the employees[] roster directly (bypassing
 * employees.shiftAssignment permissions and branch scope). BM direct updates
 * must leave employees[] unchanged; other roles are unaffected.
 *
 * Run against the Firestore emulator:
 *   firebase emulators:exec --only firestore --project demo-allmed-rules \
 *     "node --test functions/scripts/rules-shifts.test.js"
 */

const PROJECT_ID = 'demo-allmed-rules';
const RULES = fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
const EMULATOR_AVAILABLE = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

const ASSIGNMENT = { assignmentId: 'a1', employeeId: 'e1', employeeCode: 'E001', fromDate: '2026-01-01', toDate: '2026-01-31' };
const SHIFT_DOC = { startTime: '09:00', endTime: '17:00', employees: [{ ...ASSIGNMENT }] };

const FULL = { employees: { accessMode: 'full' }, shifts: { accessMode: 'full' } };
const BM_PERMS = {
  employees: { accessMode: 'custom', items: { shiftAssignment: { actions: ['view', 'add', 'edit'] } } },
  shifts: { accessMode: 'custom', items: { shifts: { actions: ['view', 'edit'] } } },
};

let testEnv;

const dbFor = (uid) => testEnv.authenticatedContext(uid).firestore();
const shiftRef = (uid, id = 's1') => doc(dbFor(uid), 'shifts', id);

before(async () => {
  if (!EMULATOR_AVAILABLE) return;
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES },
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'bm'), { roleId: 'branch-manager', designation: 'Branch Manager', name: 'BM' });
    await setDoc(doc(db, 'users', 'bm-legacy'), { designation: 'Branch Manager', name: 'Legacy BM' });
    await setDoc(doc(db, 'users', 'dir'), { roleId: 'director', designation: 'Director', name: 'Dir' });
    await setDoc(doc(db, 'users', 'hr'), { roleId: 'hr', designation: 'HR', name: 'HR' });
    await setDoc(doc(db, 'roles', 'branch-manager'), { name: 'Branch Manager', permissions: BM_PERMS });
    await setDoc(doc(db, 'roles', 'director'), { name: 'Director', permissions: FULL });
    await setDoc(doc(db, 'roles', 'hr'), { name: 'HR', permissions: FULL });
    await setDoc(doc(db, 'shifts', 's1'), SHIFT_DOC);
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

describe('shifts rules: branch-manager cannot mutate employees[] directly', { skip: !EMULATOR_AVAILABLE && 'requires the Firestore emulator' }, () => {
  it('denies BM removing an employee entry via direct update', async () => {
    await assertFails(updateDoc(shiftRef('bm'), { employees: [] }));
  });

  it('denies BM appending an employee entry via direct update', async () => {
    await assertFails(updateDoc(shiftRef('bm'), {
      employees: [ASSIGNMENT, { assignmentId: 'a2', employeeId: 'e2', employeeCode: 'E002' }],
    }));
  });

  it('denies BM mutating an employee entry in place via direct update', async () => {
    await assertFails(updateDoc(shiftRef('bm'), {
      employees: [{ ...ASSIGNMENT, fromDate: '2026-02-01' }],
    }));
  });

  it('denies legacy-designation BM (no roleId) mutating employees[]', async () => {
    await assertFails(updateDoc(shiftRef('bm-legacy'), { employees: [] }));
  });

  it('allows BM to edit non-employee shift fields while employees[] is unchanged', async () => {
    await assertSucceeds(updateDoc(shiftRef('bm'), { startTime: '10:00', endTime: '18:00' }));
  });

  it('allows BM to write employees[] back unchanged alongside other fields', async () => {
    await assertSucceeds(updateDoc(shiftRef('bm'), { startTime: '09:30', employees: [{ ...ASSIGNMENT }] }));
  });

  it('still denies BM creating or deleting shift docs (no add/delete permission)', async () => {
    await assertFails(setDoc(doc(dbFor('bm'), 'shifts', 's2'), SHIFT_DOC));
    await assertFails(deleteDoc(shiftRef('bm')));
  });
});

describe('shifts rules: other roles unaffected', { skip: !EMULATOR_AVAILABLE && 'requires the Firestore emulator' }, () => {
  it('allows director to modify employees[] directly', async () => {
    await assertSucceeds(updateDoc(shiftRef('dir'), { employees: [] }));
  });

  it('allows hr to modify employees[] directly', async () => {
    await assertSucceeds(updateDoc(shiftRef('hr'), {
      employees: [ASSIGNMENT, { assignmentId: 'a2', employeeId: 'e2', employeeCode: 'E002' }],
    }));
  });
});
