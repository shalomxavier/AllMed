const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

/**
 * Regression tests for RBAC enforcement in the shift-assignment callables.
 *
 * Previously `getCallerRole` only checked role *membership*
 * (Director | HR | Branch Manager), so a Branch Manager whose
 * employees.shiftAssignment.delete action was revoked could still delete
 * assignments. The callables must now check the specific permission action.
 *
 * The compiled functions in ../lib are exercised with stubbed firebase-admin,
 * firebase-functions, and ./config (db) modules injected via require.cache.
 * Run `npm run build` in the functions directory first.
 */

class StubHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const libDir = path.join(__dirname, '..', 'lib');
const resolveFromLib = (spec) => require.resolve(spec, { paths: [libDir] });

// Swap-able db so each test can inject a fresh mock without re-requiring modules.
const configStub = { db: null };
require.cache[resolveFromLib('./config')] = { exports: configStub };
require.cache[resolveFromLib('firebase-functions')] = {
  exports: { https: { onCall: (handler) => handler, onRequest: (handler) => handler, HttpsError: StubHttpsError } },
};
const stubFirestore = Object.assign(() => ({}), {
  FieldValue: { serverTimestamp: () => 'serverTimestamp' },
});
require.cache[resolveFromLib('firebase-admin')] = {
  exports: { firestore: stubFirestore, initializeApp: () => {}, messaging: () => ({}) },
};

const {
  addExistingShiftAssignment,
  updateExistingShiftAssignment,
  removeExistingShiftAssignment,
  changeExistingShiftAssignmentForDate,
} = require(resolveFromLib('./shiftAssignments'));
const { hasRolePermission } = require(resolveFromLib('./permissions'));

function createMockDb({ users = {}, roles = {}, branches = [], shifts = {}, employees = {} } = {}) {
  const store = { users, roles, branches, shifts, employees, _ids: {} };
  const updates = [];
  let idCounter = 0;

  const docSnap = (ref) => {
    const data = store[ref.__doc]?.[ref.id];
    return { id: ref.id, exists: data !== undefined, data: () => data, ref };
  };

  const collectionDocs = (collName) =>
    Object.entries(store[collName] || {}).map(([id, data]) => ({ id, exists: true, data: () => data }));

  const makeDocRef = (collName, id) => {
    const ref = { id: id ?? `generated-${++idCounter}`, __doc: collName };
    ref.get = async () => docSnap(ref);
    return ref;
  };

  const makeCollection = (collName) => ({
    __collection: collName,
    doc: (id) => makeDocRef(collName, id),
    get: async () => ({ docs: collectionDocs(collName) }),
    where: (field, op, value) => ({
      get: async () => {
        const entries = Array.isArray(store[collName]) ? store[collName] : Object.values(store[collName] || {});
        const docs = entries
          .filter((d) => (op === '==' ? d[field] === value : true))
          .map((d) => ({ data: () => d }));
        return { docs };
      },
    }),
  });

  const transaction = {
    get: async (ref) => (ref.__collection ? { docs: collectionDocs(ref.__collection) } : docSnap(ref)),
    update: (ref, data) => {
      updates.push({ collection: ref.__doc, id: ref.id, data });
      store[ref.__doc][ref.id] = { ...store[ref.__doc][ref.id], ...data };
    },
  };

  return {
    collection: makeCollection,
    runTransaction: async (fn) => fn(transaction),
    updates,
    store,
  };
}

const SHIFT_ASSIGNMENT_ONLY = (actions) => ({
  employees: { accessMode: 'custom', items: { shiftAssignment: { actions } } },
});

const BM_NO_DELETE = SHIFT_ASSIGNMENT_ONLY(['view', 'add', 'edit']);
const BM_ALL_ACTIONS = SHIFT_ASSIGNMENT_ONLY(['view', 'add', 'edit', 'delete']);
const DIRECTOR_PERMS = { employees: { accessMode: 'full' } };
const OPS_MANAGER_PERMS = { dms: { accessMode: 'full' } };

const EMPLOYEE = { employeeCode: 'E001', employeeName: 'Test Employee' };
const ASSIGNMENT = { assignmentId: 'a1', employeeId: 'e1', employeeCode: 'E001', fromDate: '2026-01-01', toDate: '2026-01-31' };
const SLOT = { startTime: '09:00', endTime: '17:00', employees: [{ ...ASSIGNMENT }] };

function dbFor({ users, roles, branches = [], shifts = { s1: { ...SLOT, employees: [{ ...ASSIGNMENT }] } }, employees = { e1: EMPLOYEE } }) {
  const db = createMockDb({ users, roles, branches, shifts, employees });
  configStub.db = db;
  return db;
}

const ctx = (uid) => ({ auth: { uid } });
const expectDenied = (promise) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.code, 'permission-denied');
    return true;
  });

describe('shiftAssignments callable permission enforcement', () => {
  it('DENIES branch-manager deleting an assignment when shiftAssignment delete is revoked', async () => {
    const db = dbFor({
      users: { bm: { roleId: 'branch-manager', designation: 'Branch Manager' } },
      roles: { 'branch-manager': { permissions: BM_NO_DELETE } },
      branches: [{ managerId: 'bm', employeeIds: ['e1'], shiftIds: ['s1'] }],
    });

    await expectDenied(
      removeExistingShiftAssignment(
        { employeeId: 'e1', shiftId: 's1', assignmentId: 'a1' },
        ctx('bm')
      )
    );
    assert.equal(db.updates.length, 0, 'no Firestore write should occur');
  });

  it('ALLOWS branch-manager shiftAssignment view/add/edit when delete is revoked', async () => {
    const db = dbFor({
      users: { bm: { roleId: 'branch-manager', designation: 'Branch Manager' } },
      roles: { 'branch-manager': { permissions: BM_NO_DELETE } },
      branches: [{ managerId: 'bm', employeeIds: ['e1'], shiftIds: ['s1', 's2'] }],
      shifts: {
        s1: { ...SLOT, employees: [{ ...ASSIGNMENT }] },
        s2: { startTime: '18:00', endTime: '22:00', employees: [] },
      },
    });

    assert.equal(await hasRolePermission('bm', 'employees', 'shiftAssignment', 'view'), true);
    assert.equal(await hasRolePermission('bm', 'employees', 'shiftAssignment', 'add'), true);
    assert.equal(await hasRolePermission('bm', 'employees', 'shiftAssignment', 'edit'), true);
    assert.equal(await hasRolePermission('bm', 'employees', 'shiftAssignment', 'delete'), false);

    // add (non-overlapping dates, in-scope shift)
    const added = await addExistingShiftAssignment(
      { employeeId: 'e1', shiftId: 's2', fromDate: '2026-02-01', toDate: '2026-02-10' },
      ctx('bm')
    );
    assert.ok(added.assignmentId);

    // edit (move/change dates on existing assignment)
    await updateExistingShiftAssignment(
      { employeeId: 'e1', sourceShiftId: 's1', destinationShiftId: 's1', assignmentId: 'a1', fromDate: '2026-03-01', toDate: '2026-03-10' },
      ctx('bm')
    );

    // edit (change assignment for a single date within the updated range)
    await changeExistingShiftAssignmentForDate(
      { employeeId: 'e1', sourceShiftId: 's1', destinationShiftId: 's1', assignmentId: 'a1', date: '2026-03-05' },
      ctx('bm')
    );

    assert.ok(db.updates.length >= 3, 'add/edit operations should have written');
  });

  it('ALLOWS branch-manager delete when the role still grants it', async () => {
    const db = dbFor({
      users: { bm: { roleId: 'branch-manager', designation: 'Branch Manager' } },
      roles: { 'branch-manager': { permissions: BM_ALL_ACTIONS } },
      branches: [{ managerId: 'bm', employeeIds: ['e1'], shiftIds: ['s1'] }],
    });

    const result = await removeExistingShiftAssignment(
      { employeeId: 'e1', shiftId: 's1', assignmentId: 'a1' },
      ctx('bm')
    );
    assert.deepEqual(result, { success: true });
    const update = db.updates.find((u) => u.collection === 'shifts' && u.id === 's1');
    assert.ok(update, 'shift doc should have been updated');
    assert.equal(update.data.employees.length, 0, 'assignment should be removed');
  });

  it('still enforces branch scope for branch-manager (out-of-branch employee denied)', async () => {
    dbFor({
      users: { bm: { roleId: 'branch-manager', designation: 'Branch Manager' } },
      roles: { 'branch-manager': { permissions: BM_ALL_ACTIONS } },
      branches: [{ managerId: 'bm', employeeIds: ['other-emp'], shiftIds: ['other-shift'] }],
      employees: { e1: EMPLOYEE },
    });

    await expectDenied(
      removeExistingShiftAssignment(
        { employeeId: 'e1', shiftId: 's1', assignmentId: 'a1' },
        ctx('bm')
      )
    );
    await expectDenied(
      changeExistingShiftAssignmentForDate(
        { employeeId: 'e1', sourceShiftId: 's1', destinationShiftId: 's1', assignmentId: 'a1', date: '2026-01-15' },
        ctx('bm')
      )
    );
  });

  it('ALLOWS hr (full access role) to add/edit/delete assignments', async () => {
    dbFor({
      users: { hr: { roleId: 'hr', designation: 'HR' } },
      roles: { hr: { permissions: DIRECTOR_PERMS } },
      branches: [],
      shifts: {
        s1: { ...SLOT, employees: [{ ...ASSIGNMENT }] },
        s2: { startTime: '18:00', endTime: '22:00', employees: [] },
      },
    });

    await addExistingShiftAssignment(
      { employeeId: 'e1', shiftId: 's2', fromDate: '2026-02-01', toDate: '2026-02-10' },
      ctx('hr')
    );
    const removed = await removeExistingShiftAssignment(
      { employeeId: 'e1', shiftId: 's1', assignmentId: 'a1' },
      ctx('hr')
    );
    assert.deepEqual(removed, { success: true });
  });

  it('ALLOWS director (full access role) to delete an assignment', async () => {
    const db = dbFor({
      users: { dir: { roleId: 'director', designation: 'Director' } },
      roles: { director: { permissions: DIRECTOR_PERMS } },
    });

    const result = await removeExistingShiftAssignment(
      { employeeId: 'e1', shiftId: 's1', assignmentId: 'a1' },
      ctx('dir')
    );
    assert.deepEqual(result, { success: true });
    assert.ok(db.updates.length > 0);
  });

  it('DENIES roles without employees.shiftAssignment permission entirely', async () => {
    dbFor({
      users: { ops: { roleId: 'operations-manager', designation: 'Operations Manager' } },
      roles: { 'operations-manager': { permissions: OPS_MANAGER_PERMS } },
    });

    await expectDenied(
      removeExistingShiftAssignment(
        { employeeId: 'e1', shiftId: 's1', assignmentId: 'a1' },
        ctx('ops')
      )
    );
    await expectDenied(
      addExistingShiftAssignment(
        { employeeId: 'e1', shiftId: 's1', fromDate: '2026-02-01', toDate: '2026-02-10' },
        ctx('ops')
      )
    );
  });
});
