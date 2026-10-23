const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

/**
 * Regression tests for permission enforcement in the shift-assignment callables.
 *
 * Authorization comes solely from users/{uid}.permissions — roleId/designation
 * only feed administrative scope checks (e.g. branch-manager branch scoping).
 * Two users with the same role can therefore have different outcomes.
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
const { hasUserPermission } = require(resolveFromLib('./permissions'));

function createMockDb({ users = {}, branches = [], shifts = {}, employees = {} } = {}) {
  const store = { users, branches, shifts, employees, _ids: {} };
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
const FULL_PERMS = { employees: { accessMode: 'full' } };
const DMS_ONLY_PERMS = { dms: { accessMode: 'full' } };

const EMPLOYEE = { employeeCode: 'E001', employeeName: 'Test Employee' };
const ASSIGNMENT = { assignmentId: 'a1', employeeId: 'e1', employeeCode: 'E001', fromDate: '2026-01-01', toDate: '2026-01-31' };
const SLOT = { startTime: '09:00', endTime: '17:00', employees: [{ ...ASSIGNMENT }] };

function dbFor({ users, branches = [], shifts = { s1: { ...SLOT, employees: [{ ...ASSIGNMENT }] } }, employees = { e1: EMPLOYEE } }) {
  const db = createMockDb({ users, branches, shifts, employees });
  configStub.db = db;
  return db;
}

const ctx = (uid) => ({ auth: { uid } });
const expectDenied = (promise) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.code, 'permission-denied');
    return true;
  });

describe('shiftAssignments direct user permission enforcement', () => {
  it('DENIES a branch-manager user whose permissions lack shiftAssignment delete', async () => {
    const db = dbFor({
      users: { bm: { roleId: 'branch-manager', designation: 'Branch Manager', permissions: BM_NO_DELETE } },
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

  it('ALLOWS a branch-manager user with shiftAssignment view/add/edit but not delete', async () => {
    const db = dbFor({
      users: { bm: { roleId: 'branch-manager', designation: 'Branch Manager', permissions: BM_NO_DELETE } },
      branches: [{ managerId: 'bm', employeeIds: ['e1'], shiftIds: ['s1', 's2'] }],
      shifts: {
        s1: { ...SLOT, employees: [{ ...ASSIGNMENT }] },
        s2: { startTime: '18:00', endTime: '22:00', employees: [] },
      },
    });

    assert.equal(await hasUserPermission('bm', 'employees', 'shiftAssignment', 'view'), true);
    assert.equal(await hasUserPermission('bm', 'employees', 'shiftAssignment', 'add'), true);
    assert.equal(await hasUserPermission('bm', 'employees', 'shiftAssignment', 'edit'), true);
    assert.equal(await hasUserPermission('bm', 'employees', 'shiftAssignment', 'delete'), false);

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

  it('ALLOWS a branch-manager user whose direct permissions grant delete', async () => {
    const db = dbFor({
      users: { bm: { roleId: 'branch-manager', designation: 'Branch Manager', permissions: BM_ALL_ACTIONS } },
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

  it('two users with the same role can have different permission outcomes', async () => {
    const db = dbFor({
      users: {
        bmA: { roleId: 'branch-manager', designation: 'Branch Manager', permissions: BM_ALL_ACTIONS },
        bmB: { roleId: 'branch-manager', designation: 'Branch Manager', permissions: BM_NO_DELETE },
      },
      branches: [
        { managerId: 'bmA', employeeIds: ['e1'], shiftIds: ['s1'] },
        { managerId: 'bmB', employeeIds: ['e1'], shiftIds: ['s1'] },
      ],
    });

    assert.equal(await hasUserPermission('bmA', 'employees', 'shiftAssignment', 'delete'), true);
    assert.equal(await hasUserPermission('bmB', 'employees', 'shiftAssignment', 'delete'), false);

    const result = await removeExistingShiftAssignment(
      { employeeId: 'e1', shiftId: 's1', assignmentId: 'a1' },
      ctx('bmA')
    );
    assert.deepEqual(result, { success: true });
    assert.ok(db.updates.length > 0);
  });

  it('changing a user\'s roleId does not change their permissions', async () => {
    // Same direct permission tree on two docs that differ only in roleId:
    // authorization outcomes are identical.
    const db = dbFor({
      users: {
        asBM: { roleId: 'branch-manager', designation: 'Branch Manager', permissions: BM_ALL_ACTIONS },
        asHR: { roleId: 'hr', designation: 'HR', permissions: BM_ALL_ACTIONS },
      },
      branches: [{ managerId: 'asBM', employeeIds: ['e1'], shiftIds: ['s1'] }],
    });

    assert.equal(await hasUserPermission('asBM', 'employees', 'shiftAssignment', 'delete'), true);
    assert.equal(await hasUserPermission('asHR', 'employees', 'shiftAssignment', 'delete'), true);

    // HR is not branch-scoped, so the same grant allows the write outright.
    const result = await removeExistingShiftAssignment(
      { employeeId: 'e1', shiftId: 's1', assignmentId: 'a1' },
      ctx('asHR')
    );
    assert.deepEqual(result, { success: true });
    assert.ok(db.updates.length > 0);
  });

  it('still enforces branch scope for branch-manager users regardless of direct grants', async () => {
    dbFor({
      users: { bm: { roleId: 'branch-manager', designation: 'Branch Manager', permissions: BM_ALL_ACTIONS } },
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

  it('ALLOWS an HR user with full employees access to add/edit/delete assignments', async () => {
    dbFor({
      users: { hr: { roleId: 'hr', designation: 'HR', permissions: FULL_PERMS } },
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

  it('ALLOWS a director user with full employees access to delete an assignment', async () => {
    const db = dbFor({
      users: { dir: { roleId: 'director', designation: 'Director', permissions: FULL_PERMS } },
    });

    const result = await removeExistingShiftAssignment(
      { employeeId: 'e1', shiftId: 's1', assignmentId: 'a1' },
      ctx('dir')
    );
    assert.deepEqual(result, { success: true });
    assert.ok(db.updates.length > 0);
  });

  it('DENIES a user with a full grant on an unrelated module', async () => {
    dbFor({
      users: { ops: { roleId: 'operations-manager', designation: 'Operations Manager', permissions: DMS_ONLY_PERMS } },
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

  it('DENIES a user with no permissions field at all', async () => {
    dbFor({
      users: { legacy: { roleId: 'hr', designation: 'HR' } },
    });

    await expectDenied(
      removeExistingShiftAssignment(
        { employeeId: 'e1', shiftId: 's1', assignmentId: 'a1' },
        ctx('legacy')
      )
    );
  });
});
