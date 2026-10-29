import { describe, expect, it } from 'vitest';
import {
  conflictingShiftAssignments,
  findAssignmentsForDate,
  flattenShiftAssignments,
  mergeAdjacentAssignments,
  resolveShiftAssignment,
  splitAssignmentForDate,
  timeRangesOverlap,
  type ShiftSlotDocument,
} from './shiftAssignments';

const slots: ShiftSlotDocument[] = [{
  id: 'day',
  startTime: '09:00',
  endTime: '18:00',
  employees: [
    { assignmentId: 'before', employeeCode: ' EMP-1 ', fromDate: '2026-09-01', toDate: '2026-09-10' },
    { assignmentId: 'after', employeeCode: 'emp-1', fromDate: '2026-09-12', toDate: '2026-09-30' },
  ],
}, {
  id: 'override',
  startTime: '10:00',
  endTime: '19:00',
  employees: [{ assignmentId: 'changed', employeeCode: 'EMP-1', fromDate: '2026-09-11', toDate: '2026-09-11' }],
}];

describe('shift assignment ranges', () => {
  it('retains every segment for an employee', () => {
    const assignments = flattenShiftAssignments(slots, 'emp-1');
    expect(assignments).toHaveLength(3);
    expect(resolveShiftAssignment(assignments, 'EMP-1', '2026-09-10').assignment?.assignmentId).toBe('before');
    expect(resolveShiftAssignment(assignments, 'EMP-1', '2026-09-11').assignment?.assignmentId).toBe('changed');
    expect(resolveShiftAssignment(assignments, 'EMP-1', '2026-09-12').assignment?.assignmentId).toBe('after');
  });

  it('splits a middle-day override without losing either side', () => {
    const result = splitAssignmentForDate({ employeeCode: 'EMP-1', fromDate: '2026-09-01', toDate: '2026-09-30' }, '2026-09-11');
    expect(result).toEqual([
      { employeeCode: 'EMP-1', assignmentId: undefined, fromDate: '2026-09-01', toDate: '2026-09-10' },
      { employeeCode: 'EMP-1', assignmentId: undefined, fromDate: '2026-09-12', toDate: '2026-09-30' },
    ]);
  });

  it('handles overrides on the first and last day', () => {
    const assignment = { employeeCode: 'EMP-1', fromDate: '2026-09-01', toDate: '2026-09-30' };
    expect(splitAssignmentForDate(assignment, '2026-09-01')).toEqual([
      { ...assignment, assignmentId: undefined, fromDate: '2026-09-02' },
    ]);
    expect(splitAssignmentForDate(assignment, '2026-09-30')).toEqual([
      { ...assignment, assignmentId: undefined, toDate: '2026-09-29' },
    ]);
  });

  it('reports overlapping assignments as ambiguous', () => {
    const assignments = flattenShiftAssignments([...slots, {
      id: 'overlap',
      startTime: '08:00',
      endTime: '17:00',
      employees: [{ assignmentId: 'bad', employeeCode: 'EMP-1', fromDate: '2026-09-11', toDate: '2026-09-12' }],
    }]);
    const resolution = resolveShiftAssignment(assignments, 'emp-1', '2026-09-11');
    expect(resolution.status).toBe('ambiguous');
    expect(resolution.matches).toHaveLength(2);
  });

  it('retains employee document identity when flattening assignments', () => {
    const assignments = flattenShiftAssignments([{
      id: 'day',
      startTime: '09:00',
      endTime: '18:00',
      employees: [{ assignmentId: 'assigned', employeeId: 'employee-doc', employeeCode: 'EMP-1', fromDate: '2026-09-01', toDate: '2026-09-30' }],
    }]);
    expect(assignments[0].employeeId).toBe('employee-doc');
  });

  it('merges adjacent same-employee ranges', () => {
    expect(mergeAdjacentAssignments([
      { employeeCode: 'EMP-1', fromDate: '2026-09-03', toDate: '2026-09-04' },
      { employeeCode: 'emp-1', fromDate: '2026-09-01', toDate: '2026-09-02' },
    ])).toEqual([{ employeeCode: 'emp-1', fromDate: '2026-09-01', toDate: '2026-09-04' }]);
  });
});

describe('multiple same-day shifts', () => {
  it('detects wall-clock overlap including night-wrap shifts', () => {
    expect(timeRangesOverlap(9 * 60, 13 * 60, 14 * 60, 20 * 60)).toBe(false);
    expect(timeRangesOverlap(9 * 60, 13 * 60, 12 * 60, 17 * 60)).toBe(true);
    // Night shift 22:00-06:00 overlaps 05:00-09:00 but not 09:00-13:00.
    expect(timeRangesOverlap(22 * 60, 6 * 60, 5 * 60, 9 * 60)).toBe(true);
    expect(timeRangesOverlap(22 * 60, 6 * 60, 9 * 60, 13 * 60)).toBe(false);
  });

  it('allows same-day assignments with non-overlapping times', () => {
    const conflicts = conflictingShiftAssignments(slots, {
      employeeCode: 'EMP-1',
      fromDate: '2026-09-05',
      toDate: '2026-09-05',
      startTime: '19:00',
      endTime: '22:00',
    });
    expect(conflicts).toHaveLength(0);
  });

  it('flags same-day assignments with overlapping times', () => {
    const conflicts = conflictingShiftAssignments(slots, {
      employeeCode: 'EMP-1',
      fromDate: '2026-09-05',
      toDate: '2026-09-05',
      startTime: '17:00',
      endTime: '22:00',
    });
    expect(conflicts.map((c) => c.assignmentId)).toEqual(['before']);
  });

  it('returns every assignment covering a date', () => {
    const multi: ShiftSlotDocument[] = [{
      id: 'day',
      startTime: '09:00',
      endTime: '13:00',
      employees: [{ assignmentId: 'a', employeeCode: 'EMP-1', fromDate: '2026-09-05', toDate: '2026-09-05' }],
    }, {
      id: 'evening',
      startTime: '14:00',
      endTime: '20:00',
      employees: [{ assignmentId: 'b', employeeCode: 'EMP-1', fromDate: '2026-09-05', toDate: '2026-09-05' }],
    }];
    const matches = findAssignmentsForDate(flattenShiftAssignments(multi, 'EMP-1'), 'EMP-1', '2026-09-05');
    expect(matches.map((m) => m.assignmentId).sort()).toEqual(['a', 'b']);
  });
});
