export type LeaveDuration = 'full_day' | 'half_day';

export interface StoredLeaveRecord {
  id?: string;
  type?: string;
  employeeCode?: string;
  employeeName?: string;
  dates?: string[];
  days?: string[];
  fromDate?: string;
  toDate?: string;
  reason?: string;
  duration?: string;
  status?: string;
}

export interface LeaveLimitRecord {
  id: string;
  employeeCode?: string;
  fromDate?: string;
  toDate?: string;
  limits?: Record<string, number>;
}

export interface ProposedLeaveAssignment {
  employeeCode: string;
  employeeName?: string;
  date: string;
  leaveType: string;
  duration?: string;
}

interface ProposalGroup {
  employeeCode: string;
  employeeName?: string;
  leaveType: string;
  limit: LeaveLimitRecord;
  requested: number;
  dates: Set<string>;
}

export type LeaveAvailabilityStatus = 'configured' | 'no_limit' | 'overlapping_limits';

export interface LeaveAvailabilitySummary {
  status: LeaveAvailabilityStatus;
  employeeCode: string;
  employeeName?: string;
  leaveType: string;
  fromDate?: string;
  toDate?: string;
  assigned?: number;
  used: number;
  selected: number;
  remainingBeforeSelection?: number;
  remainingAfterSelection?: number;
  dates: string[];
}

export interface LeaveLimitFailure {
  kind: 'limit_exceeded' | 'overlapping_limits';
  employeeCode: string;
  employeeName?: string;
  leaveType?: string;
  fromDate?: string;
  toDate?: string;
  limitId?: string;
  limit?: number;
  currentUsage?: number;
  requestedUsage?: number;
  totalUsage?: number;
  dates: string[];
  limitPeriods?: Array<Pick<LeaveLimitRecord, 'id' | 'fromDate' | 'toDate'>>;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_NAME_ALIASES: Record<string, string> = {
  sun: 'sunday',
  sunday: 'sunday',
  mon: 'monday',
  monday: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  tuesday: 'tuesday',
  wed: 'wednesday',
  wednesday: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  thursday: 'thursday',
  fri: 'friday',
  friday: 'friday',
  sat: 'saturday',
  saturday: 'saturday',
};

export const normalizeLeaveEmployeeCode = (value?: string): string => (value ?? '').trim().toLowerCase();
export const normalizeLeaveType = (value?: string): string => (value ?? '').trim().toLowerCase();

const isValidDate = (date?: string): date is string => Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date));

export const getLeaveDayValue = (duration?: string): number => duration === 'half_day' ? 0.5 : 1;

export const expandDateRange = (fromDate: string, toDate: string): string[] => {
  if (!isValidDate(fromDate) || !isValidDate(toDate) || fromDate > toDate) return [];
  const dates: string[] = [];
  const current = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};

export const leaveLimitRangesOverlap = (
  first: Pick<LeaveLimitRecord, 'fromDate' | 'toDate'>,
  second: Pick<LeaveLimitRecord, 'fromDate' | 'toDate'>,
): boolean => {
  if (!isValidDate(first.fromDate) || !isValidDate(first.toDate) || !isValidDate(second.fromDate) || !isValidDate(second.toDate)) {
    return false;
  }
  return first.fromDate <= second.toDate && second.fromDate <= first.toDate;
};

export const findOverlappingLeaveLimits = (
  limits: LeaveLimitRecord[],
  employeeCode: string,
  fromDate: string,
  toDate: string,
  excludeLimitId?: string,
): LeaveLimitRecord[] => {
  const targetCode = normalizeLeaveEmployeeCode(employeeCode);
  const candidate = { fromDate, toDate };
  return limits.filter((limit) =>
    limit.id !== excludeLimitId &&
    normalizeLeaveEmployeeCode(limit.employeeCode) === targetCode &&
    leaveLimitRangesOverlap(candidate, limit));
};

const getStoredLeaveType = (leave: StoredLeaveRecord): string =>
  leave.type === 'weekoff' ? 'Week Off' : (leave.reason || 'Other');

const getRecurringWeekOffDates = (leave: StoredLeaveRecord, rangeFrom?: string, rangeTo?: string): string[] => {
  const days = new Set(
    (leave.days ?? [])
      .map((day) => DAY_NAME_ALIASES[day.trim().toLowerCase()])
      .filter(Boolean),
  );
  if (days.size === 0) return [];

  const fromDate = leave.fromDate && leave.fromDate > (rangeFrom ?? '') ? leave.fromDate : rangeFrom;
  const toDate = leave.toDate && leave.toDate < (rangeTo ?? '9999-12-31') ? leave.toDate : rangeTo;
  if (!isValidDate(fromDate) || !isValidDate(toDate)) return [];

  return expandDateRange(fromDate, toDate).filter((date) => {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return days.has(DAY_NAMES[day]);
  });
};

export const getStoredLeaveDates = (leave: StoredLeaveRecord, rangeFrom?: string, rangeTo?: string): string[] => {
  let dates: string[];
  if (leave.type === 'weekoff' && leave.days?.length) {
    dates = getRecurringWeekOffDates(leave, rangeFrom, rangeTo);
  } else if (leave.dates?.length) {
    dates = leave.dates.filter(isValidDate);
  } else if (isValidDate(leave.fromDate)) {
    dates = expandDateRange(leave.fromDate, isValidDate(leave.toDate) ? leave.toDate : leave.fromDate);
  } else {
    dates = [];
  }

  return dates.filter((date) => (!rangeFrom || date >= rangeFrom) && (!rangeTo || date <= rangeTo));
};

export const getLeaveUsageByType = (
  employeeCode: string,
  fromDate: string,
  toDate: string,
  leaves: StoredLeaveRecord[],
  excludeLeaveId?: string,
): Record<string, number> => {
  const targetCode = normalizeLeaveEmployeeCode(employeeCode);
  const usage: Record<string, number> = {};

  leaves.forEach((leave) => {
    if (excludeLeaveId && leave.id === excludeLeaveId) return;
    if (normalizeLeaveEmployeeCode(leave.employeeCode) !== targetCode) return;
    if (leave.status && leave.status !== 'approved') return;

    const dates = getStoredLeaveDates(leave, fromDate, toDate);
    if (dates.length === 0) return;

    const type = getStoredLeaveType(leave);
    usage[type] = (usage[type] || 0) + dates.length * getLeaveDayValue(leave.duration);
  });

  return usage;
};

const getConfiguredLimit = (limit: LeaveLimitRecord, leaveType: string): number | undefined => {
  const targetType = normalizeLeaveType(leaveType);
  const entry = Object.entries(limit.limits ?? {}).find(([type]) => normalizeLeaveType(type) === targetType);
  return entry?.[1];
};

export const getLeaveAvailabilitySummaries = (
  proposals: ProposedLeaveAssignment[],
  existingLeaves: StoredLeaveRecord[],
  limits: LeaveLimitRecord[],
  excludeLeaveId?: string,
): LeaveAvailabilitySummary[] => {
  const groups = new Map<string, {
    status: LeaveAvailabilityStatus;
    employeeCode: string;
    employeeName?: string;
    leaveType: string;
    limit?: LeaveLimitRecord;
    selected: number;
    dates: Set<string>;
  }>();

  proposals.forEach((proposal) => {
    const targetCode = normalizeLeaveEmployeeCode(proposal.employeeCode);
    const matchingLimits = limits.filter((limit) =>
      normalizeLeaveEmployeeCode(limit.employeeCode) === targetCode &&
      isValidDate(limit.fromDate) &&
      isValidDate(limit.toDate) &&
      proposal.date >= limit.fromDate! &&
      proposal.date <= limit.toDate!);
    const configuredLimit = matchingLimits.length === 1 ? getConfiguredLimit(matchingLimits[0], proposal.leaveType) : undefined;
    const status: LeaveAvailabilityStatus = matchingLimits.length > 1
      ? 'overlapping_limits'
      : configuredLimit === undefined ? 'no_limit' : 'configured';
    const limit = matchingLimits.length === 1 ? matchingLimits[0] : undefined;
    const periodKey = limit ? (limit.id || `${limit.fromDate}:${limit.toDate}`) : status;
    const key = [targetCode, normalizeLeaveType(proposal.leaveType), status, periodKey].join('|');
    const group = groups.get(key) ?? {
      status,
      employeeCode: proposal.employeeCode,
      employeeName: proposal.employeeName,
      leaveType: proposal.leaveType,
      limit,
      selected: 0,
      dates: new Set<string>(),
    };
    group.selected += getLeaveDayValue(proposal.duration);
    group.dates.add(proposal.date);
    groups.set(key, group);
  });

  return [...groups.values()].map((group) => {
    const assigned = group.limit ? getConfiguredLimit(group.limit, group.leaveType) : undefined;
    const usage = group.limit?.fromDate && group.limit.toDate
      ? getLeaveUsageByType(group.employeeCode, group.limit.fromDate, group.limit.toDate, existingLeaves, excludeLeaveId)
      : {};
    const usageEntry = Object.entries(usage).find(([type]) => normalizeLeaveType(type) === normalizeLeaveType(group.leaveType));
    const used = usageEntry?.[1] ?? 0;
    return {
      status: group.status,
      employeeCode: group.employeeCode,
      employeeName: group.employeeName,
      leaveType: group.leaveType,
      fromDate: group.limit?.fromDate,
      toDate: group.limit?.toDate,
      assigned,
      used,
      selected: group.selected,
      remainingBeforeSelection: assigned === undefined ? undefined : assigned - used,
      remainingAfterSelection: assigned === undefined ? undefined : assigned - used - group.selected,
      dates: [...group.dates].sort(),
    };
  }).sort((a, b) =>
    (a.employeeName || a.employeeCode).localeCompare(b.employeeName || b.employeeCode) ||
    a.leaveType.localeCompare(b.leaveType) ||
    (a.fromDate || '').localeCompare(b.fromDate || ''));
};

export const validateLeaveAssignments = (
  proposals: ProposedLeaveAssignment[],
  existingLeaves: StoredLeaveRecord[],
  limits: LeaveLimitRecord[],
  excludeLeaveId?: string,
): LeaveLimitFailure[] => {
  const failures: LeaveLimitFailure[] = [];
  const groups = new Map<string, ProposalGroup>();
  const overlapGroups = new Map<string, LeaveLimitFailure>();

  proposals.forEach((proposal) => {
    const employeeCode = proposal.employeeCode;
    const targetCode = normalizeLeaveEmployeeCode(employeeCode);
    const matchingLimits = limits.filter((limit) =>
      normalizeLeaveEmployeeCode(limit.employeeCode) === targetCode &&
      isValidDate(limit.fromDate) &&
      isValidDate(limit.toDate) &&
      proposal.date >= limit.fromDate! &&
      proposal.date <= limit.toDate!);

    if (matchingLimits.length > 1) {
      const key = targetCode;
      const existing = overlapGroups.get(key);
      const periods = matchingLimits.map((limit) => ({ id: limit.id, fromDate: limit.fromDate, toDate: limit.toDate }));
      overlapGroups.set(key, {
        kind: 'overlapping_limits',
        employeeCode,
        employeeName: proposal.employeeName,
        dates: [...new Set([...(existing?.dates ?? []), proposal.date])].sort(),
        limitPeriods: [...(existing?.limitPeriods ?? []), ...periods]
          .filter((period, index, all) => all.findIndex((item) => item.id === period.id || (item.fromDate === period.fromDate && item.toDate === period.toDate)) === index),
      });
      return;
    }

    const limit = matchingLimits[0];
    if (!limit) return;

    const configuredLimit = getConfiguredLimit(limit, proposal.leaveType);
    if (configuredLimit === undefined) return;

    const key = [
      targetCode,
      normalizeLeaveType(proposal.leaveType),
      limit.id || `${limit.fromDate}:${limit.toDate}`,
    ].join('|');
    const group = groups.get(key) ?? {
      employeeCode,
      employeeName: proposal.employeeName,
      leaveType: proposal.leaveType,
      limit,
      requested: 0,
      dates: new Set<string>(),
    };
    group.requested += getLeaveDayValue(proposal.duration);
    group.dates.add(proposal.date);
    groups.set(key, group);
  });

  groups.forEach((group) => {
    if (!group.limit.fromDate || !group.limit.toDate) return;
    const usageByType = getLeaveUsageByType(
      group.employeeCode,
      group.limit.fromDate,
      group.limit.toDate,
      existingLeaves,
      excludeLeaveId,
    );
    const typeEntry = Object.entries(usageByType).find(([type]) => normalizeLeaveType(type) === normalizeLeaveType(group.leaveType));
    const currentUsage = typeEntry?.[1] ?? 0;
    const configuredLimit = getConfiguredLimit(group.limit, group.leaveType) ?? 0;
    const totalUsage = currentUsage + group.requested;

    if (totalUsage > configuredLimit + Number.EPSILON) {
      failures.push({
        kind: 'limit_exceeded',
        employeeCode: group.employeeCode,
        employeeName: group.employeeName,
        leaveType: group.leaveType,
        fromDate: group.limit.fromDate,
        toDate: group.limit.toDate,
        limitId: group.limit.id,
        limit: configuredLimit,
        currentUsage,
        requestedUsage: group.requested,
        totalUsage,
        dates: [...group.dates].sort(),
      });
    }
  });

  return [...overlapGroups.values(), ...failures];
};

export const formatLeaveCount = (value?: number): string => {
  if (value === undefined) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

export const formatLeaveLimitFailures = (failures: LeaveLimitFailure[]): string[] =>
  failures.map((failure) => {
    const employee = `${failure.employeeName || 'Employee'} (${failure.employeeCode})`;
    if (failure.kind === 'overlapping_limits') {
      const periods = (failure.limitPeriods ?? [])
        .map((period) => `${period.fromDate ?? '—'} → ${period.toDate ?? '—'}`)
        .join(', ');
      return `${employee}: overlapping limit periods cover ${failure.dates.join(', ')} (${periods}). Resolve the overlapping configuration before assigning.`;
    }

    return `${employee}: ${failure.leaveType} would reach ${formatLeaveCount(failure.totalUsage)} / ${formatLeaveCount(failure.limit)} for ${failure.fromDate} → ${failure.toDate} (already used ${formatLeaveCount(failure.currentUsage)}, requested ${formatLeaveCount(failure.requestedUsage)}).`;
  });
