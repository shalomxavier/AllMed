export interface ShiftEmployeeAssignment {
  assignmentId?: string;
  employeeId?: string;
  employeeCode: string;
  employeeName?: string;
  fromDate?: string;
  toDate?: string;
}

export interface ShiftSlotDocument {
  id: string;
  startTime: string;
  endTime: string;
  employees: ShiftEmployeeAssignment[];
  name?: string;
}

export interface ResolvedShiftAssignment extends ShiftEmployeeAssignment {
  assignmentId: string;
  slotId: string;
  startTime: string;
  endTime: string;
  name?: string;
  legacyIndex: number;
}

export type AssignmentResolution =
  | { status: 'none'; assignment: null; matches: [] }
  | { status: 'resolved'; assignment: ResolvedShiftAssignment; matches: [ResolvedShiftAssignment] }
  | { status: 'ambiguous'; assignment: null; matches: ResolvedShiftAssignment[] };

export const normalizeEmployeeCode = (value?: string): string => (value ?? '').trim().toLowerCase();

export const getTimingKey = (startTime: string, endTime: string): string => `${startTime.trim()}|${endTime.trim()}`;

export const isValidDateRange = (fromDate?: string, toDate?: string): boolean =>
  Boolean(fromDate && toDate && fromDate <= toDate);

export const assignmentContainsDate = (assignment: Pick<ShiftEmployeeAssignment, 'fromDate' | 'toDate'>, date: string): boolean => {
  if (!assignment.fromDate && !assignment.toDate) return true;
  if (assignment.fromDate && !assignment.toDate) return date === assignment.fromDate;
  if (!assignment.fromDate && assignment.toDate) return date === assignment.toDate;
  return date >= assignment.fromDate! && date <= assignment.toDate!;
};

export const dateRangesOverlap = (
  first: Pick<ShiftEmployeeAssignment, 'fromDate' | 'toDate'>,
  second: Pick<ShiftEmployeeAssignment, 'fromDate' | 'toDate'>,
): boolean => {
  if (!first.fromDate || !first.toDate || !second.fromDate || !second.toDate) return true;
  return first.fromDate <= second.toDate && second.fromDate <= first.toDate;
};

const MINUTES_PER_DAY = 24 * 60;

export const timeToMinutes = (time?: string): number => {
  if (!time) return NaN;
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
  return hours * 60 + minutes;
};

/**
 * Wall-clock overlap between two shift windows. Night shifts (end <= start)
 * wrap past midnight, so each window is normalized to minute ranges first.
 */
export const timeRangesOverlap = (start1: number, end1: number, start2: number, end2: number): boolean => {
  const normalize = (start: number, end: number): { start: number; end: number }[] => {
    if (end <= start) return [{ start, end: MINUTES_PER_DAY }, { start: 0, end }];
    return [{ start, end }];
  };
  return normalize(start1, end1).some((r1) =>
    normalize(start2, end2).some((r2) => r1.start < r2.end && r2.start < r1.end));
};

/** Every resolved assignment that covers `date` for `employeeCode`. */
export const findAssignmentsForDate = (
  assignments: ResolvedShiftAssignment[],
  employeeCode: string,
  date: string,
): ResolvedShiftAssignment[] => {
  const targetCode = normalizeEmployeeCode(employeeCode);
  return assignments.filter((assignment) =>
    normalizeEmployeeCode(assignment.employeeCode) === targetCode && assignmentContainsDate(assignment, date));
};

/**
 * Resolved assignments that genuinely conflict with a proposed assignment:
 * same employee, overlapping date ranges AND overlapping shift time windows.
 * Same-day assignments whose time windows do not overlap are allowed.
 */
export const conflictingShiftAssignments = (
  slots: ShiftSlotDocument[],
  proposed: Pick<ShiftEmployeeAssignment, 'employeeCode' | 'fromDate' | 'toDate'> & { startTime: string; endTime: string },
  excludedAssignmentId?: string,
): ResolvedShiftAssignment[] => {
  const proposedStart = timeToMinutes(proposed.startTime);
  const proposedEnd = timeToMinutes(proposed.endTime);
  if (!Number.isFinite(proposedStart) || !Number.isFinite(proposedEnd)) return [];
  return flattenShiftAssignments(slots, proposed.employeeCode).filter((existing) =>
    existing.assignmentId !== excludedAssignmentId
    && dateRangesOverlap(existing, proposed)
    && timeRangesOverlap(proposedStart, proposedEnd, timeToMinutes(existing.startTime), timeToMinutes(existing.endTime)));
};

export const flattenShiftAssignments = (slots: ShiftSlotDocument[], employeeCode?: string): ResolvedShiftAssignment[] => {
  const targetCode = normalizeEmployeeCode(employeeCode);
  return slots.flatMap((slot) => slot.employees.flatMap((assignment, legacyIndex) => {
    if (targetCode && normalizeEmployeeCode(assignment.employeeCode) !== targetCode) return [];
    return [{
      ...assignment,
      assignmentId: assignment.assignmentId || `${slot.id}:legacy:${legacyIndex}`,
      slotId: slot.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      name: slot.name,
      legacyIndex,
    }];
  }));
};

export const resolveShiftAssignment = (
  assignments: ResolvedShiftAssignment[],
  employeeCode: string,
  date: string,
): AssignmentResolution => {
  const targetCode = normalizeEmployeeCode(employeeCode);
  const matches = assignments.filter((assignment) =>
    normalizeEmployeeCode(assignment.employeeCode) === targetCode && assignmentContainsDate(assignment, date));
  if (matches.length === 0) return { status: 'none', assignment: null, matches: [] };
  if (matches.length === 1) return { status: 'resolved', assignment: matches[0], matches: [matches[0]] };
  return { status: 'ambiguous', assignment: null, matches };
};

const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const splitAssignmentForDate = (
  assignment: ShiftEmployeeAssignment,
  date: string,
): ShiftEmployeeAssignment[] => {
  if (!isValidDateRange(assignment.fromDate, assignment.toDate) || !assignmentContainsDate(assignment, date)) {
    throw new Error('The override date is outside the assignment range.');
  }
  const segments: ShiftEmployeeAssignment[] = [];
  if (assignment.fromDate! < date) segments.push({ ...assignment, assignmentId: undefined, toDate: addDays(date, -1) });
  if (date < assignment.toDate!) segments.push({ ...assignment, assignmentId: undefined, fromDate: addDays(date, 1) });
  return segments;
};

export const mergeAdjacentAssignments = (assignments: ShiftEmployeeAssignment[]): ShiftEmployeeAssignment[] => {
  const sorted = [...assignments].sort((a, b) => (a.fromDate ?? '').localeCompare(b.fromDate ?? ''));
  return sorted.reduce<ShiftEmployeeAssignment[]>((result, current) => {
    const previous = result[result.length - 1];
    const sameEmployee = previous && normalizeEmployeeCode(previous.employeeCode) === normalizeEmployeeCode(current.employeeCode);
    if (sameEmployee && previous.toDate && current.fromDate && addDays(previous.toDate, 1) === current.fromDate) {
      previous.toDate = current.toDate;
      return result;
    }
    result.push({ ...current });
    return result;
  }, []);
};
