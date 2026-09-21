import { describe, expect, it } from 'vitest';
import {
  flattenShiftAssignments,
  mergeAdjacentAssignments,
  resolveShiftAssignment,
  splitAssignmentForDate,
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

  it('merges adjacent same-employee ranges', () => {
    expect(mergeAdjacentAssignments([
      { employeeCode: 'EMP-1', fromDate: '2026-09-03', toDate: '2026-09-04' },
      { employeeCode: 'emp-1', fromDate: '2026-09-01', toDate: '2026-09-02' },
    ])).toEqual([{ employeeCode: 'emp-1', fromDate: '2026-09-01', toDate: '2026-09-04' }]);
  });
});
