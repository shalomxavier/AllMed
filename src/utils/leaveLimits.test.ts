import { describe, expect, it } from 'vitest';
import {
  findOverlappingLeaveLimits,
  formatLeaveLimitFailures,
  getLeaveAvailabilitySummaries,
  getLeaveUsageByType,
  getStoredLeaveDates,
  validateLeaveAssignments,
  type LeaveLimitRecord,
  type StoredLeaveRecord,
} from './leaveLimits';

const limits: LeaveLimitRecord[] = [{
  id: 'limit-1',
  employeeCode: 'EMP-1',
  fromDate: '2026-09-01',
  toDate: '2026-09-30',
  limits: { 'Casual Leave': 2, 'Week Off': 2 },
}];

describe('leave limit accounting', () => {
  it('allows assignments when no configured period covers the date', () => {
    expect(validateLeaveAssignments([
      { employeeCode: 'EMP-1', date: '2026-10-01', leaveType: 'Casual Leave' },
    ], [], limits)).toEqual([]);
  });

  it('allows a leave type that is not configured in the matching period', () => {
    expect(validateLeaveAssignments([
      { employeeCode: 'EMP-1', date: '2026-09-10', leaveType: 'Earned Leave' },
    ], [], limits)).toEqual([]);
  });

  it('allows exact remaining usage and rejects usage over the limit', () => {
    const existing: StoredLeaveRecord[] = [{
      id: 'old',
      employeeCode: 'EMP-1',
      reason: 'Casual Leave',
      dates: ['2026-09-02'],
      duration: 'full_day',
    }];

    expect(validateLeaveAssignments([
      { employeeCode: 'EMP-1', date: '2026-09-10', leaveType: 'Casual Leave' },
    ], existing, limits)).toEqual([]);

    const failures = validateLeaveAssignments([
      { employeeCode: 'EMP-1', date: '2026-09-10', leaveType: 'Casual Leave' },
      { employeeCode: 'EMP-1', date: '2026-09-11', leaveType: 'Casual Leave' },
    ], existing, limits);

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ kind: 'limit_exceeded', currentUsage: 1, requestedUsage: 2, totalUsage: 3, limit: 2 });
    expect(formatLeaveLimitFailures(failures)[0]).toBe('Employee (EMP-1):\nOnly 1 out of 2 Casual Leave Available');
  });

  it('rejects additional leave when the configured limit is already reached', () => {
    const existing: StoredLeaveRecord[] = [{
      id: 'old',
      employeeCode: 'EMP-1',
      reason: 'Casual Leave',
      dates: ['2026-09-02', '2026-09-03'],
      duration: 'full_day',
    }];

    expect(validateLeaveAssignments([
      { employeeCode: 'EMP-1', date: '2026-09-10', leaveType: 'Casual Leave' },
    ], existing, limits)).toHaveLength(1);
  });

  it('counts half days as 0.5 and aggregates proposed dates before validation', () => {
    const failures = validateLeaveAssignments([
      { employeeCode: 'EMP-1', date: '2026-09-10', leaveType: 'Casual Leave', duration: 'half_day' },
      { employeeCode: 'EMP-1', date: '2026-09-11', leaveType: 'Casual Leave', duration: 'half_day' },
      { employeeCode: 'EMP-1', date: '2026-09-12', leaveType: 'Casual Leave', duration: 'half_day' },
      { employeeCode: 'EMP-1', date: '2026-09-13', leaveType: 'Casual Leave', duration: 'half_day' },
      { employeeCode: 'EMP-1', date: '2026-09-14', leaveType: 'Casual Leave', duration: 'half_day' },
    ], [], limits);

    expect(failures).toHaveLength(1);
    expect(failures[0].requestedUsage).toBe(2.5);
  });

  it('normalizes employee codes and expands legacy leave ranges', () => {
    const existing: StoredLeaveRecord[] = [{
      id: 'range',
      employeeCode: ' emp-1 ',
      reason: 'Casual Leave',
      fromDate: '2026-09-02',
      toDate: '2026-09-03',
      duration: 'full_day',
    }];

    expect(getStoredLeaveDates(existing[0], '2026-09-01', '2026-09-30')).toEqual(['2026-09-02', '2026-09-03']);
    expect(getLeaveUsageByType('EMP-1', '2026-09-01', '2026-09-30', existing)['Casual Leave']).toBe(2);
  });

  it('ignores explicitly non-approved records and keeps legacy records countable', () => {
    const existing: StoredLeaveRecord[] = [
      { id: 'approved', employeeCode: 'EMP-1', reason: 'Casual Leave', dates: ['2026-09-02'], status: 'approved' },
      { id: 'legacy', employeeCode: 'EMP-1', reason: 'Casual Leave', dates: ['2026-09-03'] },
      { id: 'pending', employeeCode: 'EMP-1', reason: 'Casual Leave', dates: ['2026-09-04'], status: 'pending' },
    ];

    expect(getLeaveUsageByType('EMP-1', '2026-09-01', '2026-09-30', existing)['Casual Leave']).toBe(2);
  });

  it('maps recurring and dated Week Off records to the same limit type', () => {
    const existing: StoredLeaveRecord[] = [
      { id: 'recurring', type: 'weekoff', employeeCode: 'EMP-1', days: ['Sunday'] },
      { id: 'dated', type: 'leave', employeeCode: 'EMP-1', reason: 'Week Off', dates: ['2026-09-07'] },
    ];

    const usage = getLeaveUsageByType('EMP-1', '2026-09-01', '2026-09-30', existing);
    expect(usage['Week Off']).toBe(5);
  });

  it('counts abbreviated and numeric recurring Week Off days and normalized approval status', () => {
    const existing: StoredLeaveRecord[] = [
      { id: 'abbreviated', type: 'week_off', employeeCode: 'EMP-1', days: ['Su'], status: 'Approved' },
      { id: 'numeric', type: 'weekoff', employeeCode: 'EMP-1', days: ['1'], status: 'approved' },
    ];

    const usage = getLeaveUsageByType('EMP-1', '2026-09-01', '2026-09-30', existing);
    expect(usage['Week Off']).toBe(8);
  });

  it('excludes the edited record before validating its replacement', () => {
    const existing: StoredLeaveRecord[] = [{
      id: 'edit-me',
      employeeCode: 'EMP-1',
      reason: 'Casual Leave',
      dates: ['2026-09-02', '2026-09-03'],
      duration: 'full_day',
    }];

    expect(validateLeaveAssignments([
      { employeeCode: 'EMP-1', date: '2026-09-10', leaveType: 'Casual Leave' },
      { employeeCode: 'EMP-1', date: '2026-09-11', leaveType: 'Casual Leave' },
    ], existing, limits, 'edit-me')).toEqual([]);
  });

  it('fails closed when legacy overlapping periods cover a proposed date', () => {
    const overlappingLimits = [...limits, {
      id: 'limit-2',
      employeeCode: 'EMP-1',
      fromDate: '2026-09-15',
      toDate: '2026-10-15',
      limits: { 'Casual Leave': 4 },
    }];

    const failures = validateLeaveAssignments([
      { employeeCode: 'EMP-1', employeeName: 'Test User', date: '2026-09-20', leaveType: 'Casual Leave' },
    ], [], overlappingLimits);

    expect(failures).toHaveLength(1);
    expect(failures[0].kind).toBe('overlapping_limits');
    expect(formatLeaveLimitFailures(failures)[0]).toContain('overlapping limit periods');
  });
});

describe('leave availability summaries', () => {
  it('returns assigned, used, selected, and remaining values', () => {
    const summaries = getLeaveAvailabilitySummaries([
      { employeeCode: 'EMP-1', date: '2026-09-10', leaveType: 'Casual Leave', duration: 'half_day' },
    ], [{ employeeCode: 'EMP-1', reason: 'Casual Leave', dates: ['2026-09-02'] }], limits);

    expect(summaries[0]).toMatchObject({
      status: 'configured', assigned: 2, used: 1, selected: 0.5,
      remainingBeforeSelection: 1, remainingAfterSelection: 0.5,
    });
  });

  it('returns no-limit summaries for uncovered dates and unconfigured types', () => {
    const summaries = getLeaveAvailabilitySummaries([
      { employeeCode: 'EMP-1', date: '2026-10-10', leaveType: 'Casual Leave' },
      { employeeCode: 'EMP-1', date: '2026-09-10', leaveType: 'Earned Leave' },
    ], [], limits);

    expect(summaries).toHaveLength(2);
    expect(summaries.every((summary) => summary.status === 'no_limit')).toBe(true);
  });

  it('groups selections by employee and configured period and supports edit exclusion', () => {
    const twoPeriods = [...limits, {
      id: 'limit-2', employeeCode: 'EMP-1', fromDate: '2026-10-01', toDate: '2026-10-31', limits: { 'Casual Leave': 3 },
    }];
    const summaries = getLeaveAvailabilitySummaries([
      { employeeCode: 'EMP-1', date: '2026-09-10', leaveType: 'Casual Leave' },
      { employeeCode: 'EMP-1', date: '2026-10-10', leaveType: 'Casual Leave' },
    ], [{ id: 'edit-me', employeeCode: 'EMP-1', reason: 'Casual Leave', dates: ['2026-09-02'] }], twoPeriods, 'edit-me');

    expect(summaries).toHaveLength(2);
    expect(summaries.map((summary) => summary.used)).toEqual([0, 0]);
  });

  it('reports overlapping configured periods', () => {
    const summaries = getLeaveAvailabilitySummaries([
      { employeeCode: 'EMP-1', date: '2026-09-20', leaveType: 'Casual Leave' },
    ], [], [...limits, { id: 'overlap', employeeCode: 'EMP-1', fromDate: '2026-09-15', toDate: '2026-09-25', limits: { 'Casual Leave': 5 } }]);

    expect(summaries[0].status).toBe('overlapping_limits');
  });
});

describe('leave limit period overlap detection', () => {
  it('detects inclusive overlapping ranges and ignores non-overlapping ranges', () => {
    expect(findOverlappingLeaveLimits(limits, ' emp-1 ', '2026-09-30', '2026-10-10')).toHaveLength(1);
    expect(findOverlappingLeaveLimits(limits, 'EMP-1', '2026-10-01', '2026-10-10')).toHaveLength(0);
    expect(findOverlappingLeaveLimits(limits, 'EMP-2', '2026-09-01', '2026-09-30')).toHaveLength(0);
    expect(findOverlappingLeaveLimits(limits, 'EMP-1', '2026-09-01', '2026-09-30', 'limit-1')).toHaveLength(0);
  });
});
