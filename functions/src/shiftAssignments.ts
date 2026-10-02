import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { db } from './config';

type Assignment = {
  assignmentId?: string;
  employeeId?: string;
  employeeCode?: string;
  employeeName?: string;
  fromDate?: string;
  toDate?: string;
};

type Slot = {
  id: string;
  startTime: string;
  endTime: string;
  employees: Assignment[];
};

type EmployeeIdentity = {
  id: string;
  employeeCode: string;
  employeeName: string;
};

const allowedRoles = ['Director', 'HR', 'Branch Manager'];
const normalize = (value?: string): string => (value ?? '').trim().toLowerCase();
const assignmentId = (): string => db.collection('_ids').doc().id;
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const requireString = (data: Record<string, unknown>, key: string): string => {
  const value = data[key];
  if (typeof value !== 'string' || !value.trim()) throw new functions.https.HttpsError('invalid-argument', `${key} is required.`);
  return value.trim();
};

const requireDateRange = (data: Record<string, unknown>): { fromDate: string; toDate: string } => {
  const fromDate = requireString(data, 'fromDate');
  const toDate = requireString(data, 'toDate');
  if (!validDate(fromDate) || !validDate(toDate) || fromDate > toDate) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid shift date range.');
  }
  return { fromDate, toDate };
};

const getCallerRole = async (uid: string): Promise<string> => {
  const snapshot = await db.collection('users').doc(uid).get();
  const designation = snapshot.data()?.designation;
  if (!allowedRoles.includes(designation)) throw new functions.https.HttpsError('permission-denied', 'You cannot manage shift assignments.');
  return designation;
};

const authorize = async (uid: string, role: string, employeeId: string, shiftIds: string[]): Promise<void> => {
  if (role === 'Director' || role === 'HR') return;
  const snapshot = await db.collection('branches').where('managerId', '==', uid).get();
  const allowed = snapshot.docs.some((document) => {
    const branch = document.data();
    const employeeIds: string[] = branch.employeeIds ?? [];
    const allowedShiftIds: string[] = branch.shiftIds ?? [];
    return employeeIds.includes(employeeId) && shiftIds.every((id) => allowedShiftIds.includes(id));
  });
  if (!allowed) throw new functions.https.HttpsError('permission-denied', 'The employee or shift is outside your branch.');
};

const getEmployee = async (employeeId: string): Promise<EmployeeIdentity> => {
  const snapshot = await db.collection('employees').doc(employeeId).get();
  if (!snapshot.exists) throw new functions.https.HttpsError('not-found', 'Employee not found.');
  const data = snapshot.data()!;
  const employeeCode = typeof data.employeeCode === 'string' ? data.employeeCode.trim() : '';
  if (!employeeCode) throw new functions.https.HttpsError('failed-precondition', 'The employee has no employee code.');
  return { id: snapshot.id, employeeCode, employeeName: typeof data.employeeName === 'string' ? data.employeeName : '' };
};

const readSlots = async (transaction: admin.firestore.Transaction): Promise<Slot[]> => {
  const snapshot = await transaction.get(db.collection('shifts'));
  return snapshot.docs.map((document) => ({
    id: document.id,
    startTime: document.data().startTime ?? '',
    endTime: document.data().endTime ?? '',
    employees: document.data().employees ?? [],
  }));
};

const datesOverlap = (first: Assignment, second: Assignment): boolean => {
  if (!first.fromDate || !first.toDate || !second.fromDate || !second.toDate) return true;
  return first.fromDate <= second.toDate && second.fromDate <= first.toDate;
};

const findAssignmentIndex = (employees: Assignment[], selectedId: string, employee: EmployeeIdentity, fromDate?: string, toDate?: string): number => {
  const indexes = employees.reduce<number[]>((result, candidate, index) => {
    const idMatches = candidate.assignmentId ? candidate.assignmentId === selectedId : selectedId.includes(':legacy:');
    const employeeMatches = candidate.employeeId ? candidate.employeeId === employee.id : normalize(candidate.employeeCode) === normalize(employee.employeeCode);
    const datesMatch = candidate.assignmentId || !fromDate || !toDate || (candidate.fromDate === fromDate && candidate.toDate === toDate);
    if (idMatches && employeeMatches && datesMatch) result.push(index);
    return result;
  }, []);
  if (indexes.length === 0) throw new functions.https.HttpsError('not-found', 'The selected assignment no longer exists.');
  if (indexes.length > 1) throw new functions.https.HttpsError('failed-precondition', 'The selected legacy assignment is ambiguous.');
  return indexes[0];
};

const assertNoOverlap = (slots: Slot[], employee: EmployeeIdentity, proposed: Assignment, excluded?: { shiftId: string; index: number }): void => {
  const overlaps = slots.some((slot) => slot.employees.some((candidate, index) => {
    if (excluded?.shiftId === slot.id && excluded.index === index) return false;
    const sameEmployee = candidate.employeeId ? candidate.employeeId === employee.id : normalize(candidate.employeeCode) === normalize(employee.employeeCode);
    return sameEmployee && datesOverlap(candidate, proposed);
  }));
  if (overlaps) throw new functions.https.HttpsError('already-exists', 'This employee already has a shift in the selected date range.');
};

const callable = (handler: (data: Record<string, unknown>, uid: string) => Promise<unknown>) =>
  functions.https.onCall(async (data: Record<string, unknown>, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    try {
      return await handler(data ?? {}, context.auth.uid);
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      console.error('Shift assignment operation failed:', error);
      throw new functions.https.HttpsError('internal', 'Failed to update the shift assignment.');
    }
  });

export const addExistingShiftAssignment = callable(async (data, uid) => {
  const employeeId = requireString(data, 'employeeId');
  const shiftId = requireString(data, 'shiftId');
  const dates = requireDateRange(data);
  const role = await getCallerRole(uid);
  await authorize(uid, role, employeeId, [shiftId]);
  const employee = await getEmployee(employeeId);
  const newId = assignmentId();
  await db.runTransaction(async (transaction) => {
    const slots = await readSlots(transaction);
    const target = slots.find((slot) => slot.id === shiftId);
    if (!target) throw new functions.https.HttpsError('not-found', 'Shift not found.');
    assertNoOverlap(slots, employee, dates);
    transaction.update(db.collection('shifts').doc(shiftId), {
      employees: [...target.employees, { assignmentId: newId, employeeId, employeeCode: employee.employeeCode, employeeName: employee.employeeName, ...dates }],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  return { assignmentId: newId };
});

export const updateExistingShiftAssignment = callable(async (data, uid) => {
  const employeeId = requireString(data, 'employeeId');
  const sourceShiftId = requireString(data, 'sourceShiftId');
  const destinationShiftId = requireString(data, 'destinationShiftId');
  const selectedAssignmentId = requireString(data, 'assignmentId');
  const dates = requireDateRange(data);
  const role = await getCallerRole(uid);
  await authorize(uid, role, employeeId, [sourceShiftId, destinationShiftId]);
  const employee = await getEmployee(employeeId);
  const legacyFromDate = typeof data.legacyFromDate === 'string' ? data.legacyFromDate : undefined;
  const legacyToDate = typeof data.legacyToDate === 'string' ? data.legacyToDate : undefined;
  let resultingId = selectedAssignmentId;
  await db.runTransaction(async (transaction) => {
    const slots = await readSlots(transaction);
    const source = slots.find((slot) => slot.id === sourceShiftId);
    const destination = slots.find((slot) => slot.id === destinationShiftId);
    if (!source || !destination) throw new functions.https.HttpsError('not-found', 'Source or destination shift not found.');
    const index = findAssignmentIndex(source.employees, selectedAssignmentId, employee, legacyFromDate, legacyToDate);
    const selected = source.employees[index];
    resultingId = selected.assignmentId ?? assignmentId();
    assertNoOverlap(slots, employee, dates, { shiftId: sourceShiftId, index });
    const entry: Assignment = { assignmentId: resultingId, employeeId, employeeCode: employee.employeeCode, employeeName: employee.employeeName, ...dates };
    const sourceRef = db.collection('shifts').doc(sourceShiftId);
    const destinationRef = db.collection('shifts').doc(destinationShiftId);
    if (sourceShiftId === destinationShiftId) {
      transaction.update(sourceRef, { employees: source.employees.map((candidate, candidateIndex) => candidateIndex === index ? entry : candidate), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else {
      transaction.update(sourceRef, { employees: source.employees.filter((_, candidateIndex) => candidateIndex !== index), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      transaction.update(destinationRef, { employees: [...destination.employees, entry], updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  });
  return { assignmentId: resultingId };
});

export const removeExistingShiftAssignment = callable(async (data, uid) => {
  const employeeId = requireString(data, 'employeeId');
  const shiftId = requireString(data, 'shiftId');
  const selectedAssignmentId = requireString(data, 'assignmentId');
  const role = await getCallerRole(uid);
  await authorize(uid, role, employeeId, [shiftId]);
  const employee = await getEmployee(employeeId);
  const legacyFromDate = typeof data.legacyFromDate === 'string' ? data.legacyFromDate : undefined;
  const legacyToDate = typeof data.legacyToDate === 'string' ? data.legacyToDate : undefined;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(db.collection('shifts').doc(shiftId));
    if (!snapshot.exists) throw new functions.https.HttpsError('not-found', 'Shift not found.');
    const employees: Assignment[] = snapshot.data()?.employees ?? [];
    const index = findAssignmentIndex(employees, selectedAssignmentId, employee, legacyFromDate, legacyToDate);
    transaction.update(snapshot.ref, { employees: employees.filter((_, candidateIndex) => candidateIndex !== index), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { success: true };
});

export const changeExistingShiftAssignmentForDate = callable(async (data, uid) => {
  const employeeId = requireString(data, 'employeeId');
  const sourceShiftId = requireString(data, 'sourceShiftId');
  const destinationShiftId = requireString(data, 'destinationShiftId');
  const selectedAssignmentId = requireString(data, 'assignmentId');
  const date = requireString(data, 'date');
  if (!validDate(date)) throw new functions.https.HttpsError('invalid-argument', 'Invalid shift date.');
  const role = await getCallerRole(uid);
  await authorize(uid, role, employeeId, [sourceShiftId, destinationShiftId]);
  const employee = await getEmployee(employeeId);
  await db.runTransaction(async (transaction) => {
    const slots = await readSlots(transaction);
    const source = slots.find((slot) => slot.id === sourceShiftId);
    const destination = slots.find((slot) => slot.id === destinationShiftId);
    if (!source || !destination) throw new functions.https.HttpsError('not-found', 'Source or destination shift not found.');
    const index = findAssignmentIndex(source.employees, selectedAssignmentId, employee);
    const selected = source.employees[index];
    if (!selected.fromDate || !selected.toDate || date < selected.fromDate || date > selected.toDate) throw new functions.https.HttpsError('invalid-argument', 'The selected date is outside the assignment range.');
    assertNoOverlap(slots, employee, { fromDate: date, toDate: date }, { shiftId: sourceShiftId, index });
    const remaining: Assignment[] = [];
    const addDays = (value: string, days: number): string => {
      const parsed = new Date(`${value}T00:00:00Z`);
      parsed.setUTCDate(parsed.getUTCDate() + days);
      return parsed.toISOString().slice(0, 10);
    };
    if (selected.fromDate < date) remaining.push({ ...selected, assignmentId: assignmentId(), toDate: addDays(date, -1) });
    if (date < selected.toDate) remaining.push({ ...selected, assignmentId: assignmentId(), fromDate: addDays(date, 1) });
    const override: Assignment = { assignmentId: assignmentId(), employeeId, employeeCode: employee.employeeCode, employeeName: employee.employeeName, fromDate: date, toDate: date };
    const sourceRest = source.employees.filter((_, candidateIndex) => candidateIndex !== index);
    const sourceRef = db.collection('shifts').doc(sourceShiftId);
    const destinationRef = db.collection('shifts').doc(destinationShiftId);
    if (sourceShiftId === destinationShiftId) {
      transaction.update(sourceRef, { employees: [...sourceRest, ...remaining, override], updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else {
      transaction.update(sourceRef, { employees: [...sourceRest, ...remaining], updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      transaction.update(destinationRef, { employees: [...destination.employees, override], updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  });
  return { success: true };
});
