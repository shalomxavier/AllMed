import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import {
  dateRangesOverlap,
  flattenShiftAssignments,
  getTimingKey,
  normalizeEmployeeCode,
  resolveShiftAssignment,
  splitAssignmentForDate,
  type ResolvedShiftAssignment,
  type ShiftEmployeeAssignment,
  type ShiftSlotDocument,
} from '@/utils/shiftAssignments';

export interface NewShiftAssignment {
  employeeCode: string;
  employeeName?: string;
  fromDate: string;
  toDate: string;
  startTime: string;
  endTime: string;
}

const shiftsCollection = collection(db, 'shifts');

const newAssignmentId = (): string => doc(collection(db, '_ids')).id;

const readSlots = async (): Promise<ShiftSlotDocument[]> => {
  const snapshot = await getDocs(shiftsCollection);
  return snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      startTime: data.startTime ?? '',
      endTime: data.endTime ?? '',
      name: data.name,
      employees: data.employees ?? [],
    };
  });
};

const findUniqueSlot = async (startTime: string, endTime: string): Promise<string | null> => {
  const snapshot = await getDocs(query(shiftsCollection,
    where('startTime', '==', startTime),
    where('endTime', '==', endTime)));
  if (snapshot.size > 1) throw new Error(`Multiple shift slots use timing ${getTimingKey(startTime, endTime)}. Run the shift audit before editing assignments.`);
  return snapshot.empty ? null : snapshot.docs[0].id;
};

const matchesSelectedAssignment = (candidate: ShiftEmployeeAssignment, selected: ResolvedShiftAssignment): boolean => {
  if (candidate.assignmentId && !selected.assignmentId.includes(':legacy:')) return candidate.assignmentId === selected.assignmentId;
  return normalizeEmployeeCode(candidate.employeeCode) === normalizeEmployeeCode(selected.employeeCode)
    && candidate.fromDate === selected.fromDate
    && candidate.toDate === selected.toDate;
};

const findSelectedIndex = (employees: ShiftEmployeeAssignment[], selected: ResolvedShiftAssignment): number => {
  const indexes = employees.reduce<number[]>((result, candidate, index) => {
    if (matchesSelectedAssignment(candidate, selected)) result.push(index);
    return result;
  }, []);
  if (indexes.length !== 1) throw new Error(indexes.length === 0
    ? 'The selected shift assignment no longer exists. Refresh and try again.'
    : 'The selected legacy assignment is ambiguous. Run the shift audit before editing it.');
  return indexes[0];
};

const assertNoOverlap = (slots: ShiftSlotDocument[], assignment: NewShiftAssignment, excludedAssignmentId?: string): void => {
  const targetCode = normalizeEmployeeCode(assignment.employeeCode);
  const overlaps = flattenShiftAssignments(slots, targetCode).filter((existing) =>
    existing.assignmentId !== excludedAssignmentId
    && dateRangesOverlap(existing, assignment));
  if (overlaps.length > 0) throw new Error(`Shift overlaps ${overlaps.length} existing assignment(s).`);
};

const addAssignment = async (assignment: NewShiftAssignment): Promise<string> => {
  if (!assignment.fromDate || !assignment.toDate || assignment.fromDate > assignment.toDate) throw new Error('Invalid shift date range.');
  const slots = await readSlots();
  assertNoOverlap(slots, assignment);
  const existingSlotId = await findUniqueSlot(assignment.startTime, assignment.endTime);
  const slotRef = existingSlotId ? doc(db, 'shifts', existingSlotId) : doc(shiftsCollection);
  const assignmentId = newAssignmentId();
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(slotRef);
    const entry: ShiftEmployeeAssignment = {
      assignmentId,
      employeeCode: assignment.employeeCode,
      employeeName: assignment.employeeName ?? '',
      fromDate: assignment.fromDate,
      toDate: assignment.toDate,
    };
    if (snapshot.exists()) {
      transaction.update(slotRef, { employees: [...(snapshot.data().employees ?? []), entry], updatedAt: serverTimestamp() });
    } else {
      transaction.set(slotRef, {
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        employees: [entry],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  });
  return assignmentId;
};

const removeAssignment = async (selected: ResolvedShiftAssignment): Promise<void> => {
  const slotRef = doc(db, 'shifts', selected.slotId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(slotRef);
    if (!snapshot.exists()) throw new Error('The shift slot no longer exists.');
    const employees: ShiftEmployeeAssignment[] = snapshot.data().employees ?? [];
    const selectedIndex = findSelectedIndex(employees, selected);
    transaction.update(slotRef, {
      employees: employees.filter((_, index) => index !== selectedIndex),
      updatedAt: serverTimestamp(),
    });
  });
};

const moveAssignment = async (selected: ResolvedShiftAssignment, replacement: NewShiftAssignment): Promise<string> => {
  if (!replacement.fromDate || !replacement.toDate || replacement.fromDate > replacement.toDate) throw new Error('Invalid shift date range.');
  const slots = await readSlots();
  assertNoOverlap(slots, replacement, selected.assignmentId);
  const destinationSlotId = await findUniqueSlot(replacement.startTime, replacement.endTime);
  const sourceRef = doc(db, 'shifts', selected.slotId);
  const destinationRef = destinationSlotId ? doc(db, 'shifts', destinationSlotId) : doc(shiftsCollection);
  const assignmentId = selected.assignmentId.includes(':legacy:') ? newAssignmentId() : selected.assignmentId;

  await runTransaction(db, async (transaction) => {
    const sourceSnapshot = await transaction.get(sourceRef);
    if (!sourceSnapshot.exists()) throw new Error('The source shift slot no longer exists.');
    const sameSlot = sourceRef.path === destinationRef.path;
    const destinationSnapshot = sameSlot ? sourceSnapshot : await transaction.get(destinationRef);
    const sourceEmployees: ShiftEmployeeAssignment[] = sourceSnapshot.data().employees ?? [];
    const selectedIndex = findSelectedIndex(sourceEmployees, selected);
    const entry: ShiftEmployeeAssignment = {
      assignmentId,
      employeeCode: replacement.employeeCode,
      employeeName: replacement.employeeName ?? selected.employeeName ?? '',
      fromDate: replacement.fromDate,
      toDate: replacement.toDate,
    };

    if (sameSlot) {
      transaction.update(sourceRef, {
        employees: sourceEmployees.map((candidate, index) => index === selectedIndex ? entry : candidate),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    transaction.update(sourceRef, {
      employees: sourceEmployees.filter((_, index) => index !== selectedIndex),
      updatedAt: serverTimestamp(),
    });
    if (destinationSnapshot.exists()) {
      transaction.update(destinationRef, {
        employees: [...(destinationSnapshot.data().employees ?? []), entry],
        updatedAt: serverTimestamp(),
      });
    } else {
      transaction.set(destinationRef, {
        startTime: replacement.startTime,
        endTime: replacement.endTime,
        employees: [entry],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  });
  return assignmentId;
};

const changeAssignmentForDate = async (
  employeeCode: string,
  date: string,
  startTime: string,
  endTime: string,
): Promise<void> => {
  const slots = await readSlots();
  const assignments = flattenShiftAssignments(slots, employeeCode);
  const resolution = resolveShiftAssignment(assignments, employeeCode, date);
  if (resolution.status !== 'resolved') throw new Error(resolution.status === 'none'
    ? 'No shift assignment covers the selected date.'
    : 'Multiple shifts cover the selected date. Run the shift audit before changing it.');
  const selected = resolution.assignment;
  const remainingSegments = splitAssignmentForDate(selected, date);
  const destinationSlotId = await findUniqueSlot(startTime, endTime);
  const sourceRef = doc(db, 'shifts', selected.slotId);
  const destinationRef = destinationSlotId ? doc(db, 'shifts', destinationSlotId) : doc(shiftsCollection);

  await runTransaction(db, async (transaction) => {
    const sourceSnapshot = await transaction.get(sourceRef);
    if (!sourceSnapshot.exists()) throw new Error('The source shift slot no longer exists.');
    const sameSlot = sourceRef.path === destinationRef.path;
    const destinationSnapshot = sameSlot ? sourceSnapshot : await transaction.get(destinationRef);
    const sourceEmployees: ShiftEmployeeAssignment[] = sourceSnapshot.data().employees ?? [];
    const selectedIndex = findSelectedIndex(sourceEmployees, selected);
    const splitEntries = remainingSegments.map((segment) => ({ ...segment, assignmentId: newAssignmentId() }));
    const overrideEntry: ShiftEmployeeAssignment = {
      assignmentId: newAssignmentId(),
      employeeCode: selected.employeeCode,
      employeeName: selected.employeeName ?? '',
      fromDate: date,
      toDate: date,
    };
    const sourceWithoutSelected = sourceEmployees.filter((_, index) => index !== selectedIndex);

    if (sameSlot) {
      transaction.update(sourceRef, {
        employees: [...sourceWithoutSelected, ...splitEntries, overrideEntry],
        updatedAt: serverTimestamp(),
      });
      return;
    }

    transaction.update(sourceRef, {
      employees: [...sourceWithoutSelected, ...splitEntries],
      updatedAt: serverTimestamp(),
    });
    if (destinationSnapshot.exists()) {
      transaction.update(destinationRef, {
        employees: [...(destinationSnapshot.data().employees ?? []), overrideEntry],
        updatedAt: serverTimestamp(),
      });
    } else {
      transaction.set(destinationRef, {
        startTime,
        endTime,
        employees: [overrideEntry],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  });
};

export const shiftAssignmentsService = {
  readSlots,
  addAssignment,
  removeAssignment,
  moveAssignment,
  changeAssignmentForDate,
};
