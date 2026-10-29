import { timeToMinutes } from './shiftAssignments';

const MINUTES_PER_DAY = 24 * 60;

/**
 * How far past a shift boundary a punch may fall and still count toward that
 * shift. Matches the 2-hour anomaly threshold used across attendance reports.
 */
export const SHIFT_PUNCH_GRACE_MINUTES = 120;

export interface ShiftTiming {
  id?: string;
  name?: string;
  startTime?: string;
  endTime?: string;
  fromDate?: string;
  toDate?: string;
}

export interface TimedPunch {
  id: string;
  time: Date;
  direction: 'in' | 'out';
  isEdited?: boolean;
}

export interface PunchSession {
  inPunches: TimedPunch[];
  outPunches: TimedPunch[];
}

export interface ShiftMetrics {
  workingDurationMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeMinutes: number;
}

export const isNightTiming = (shift: ShiftTiming | null | undefined): boolean => {
  const start = timeToMinutes(shift?.startTime);
  const end = timeToMinutes(shift?.endTime);
  return Number.isFinite(start) && Number.isFinite(end) && end <= start;
};

/** Duration of a shift window in minutes; 00:00-00:00 or end <= start wraps midnight. */
export const shiftDurationMinutes = (shift: ShiftTiming): number => {
  const start = timeToMinutes(shift.startTime);
  const end = timeToMinutes(shift.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const duration = (end - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return duration === 0 ? MINUTES_PER_DAY : duration;
};

export const shiftDateAdd = (dateStr: string, days: number): string => {
  const value = new Date(`${dateStr}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const formatDateKey = (date: Date): string => date.toISOString().slice(0, 10);

/** Minutes elapsed since midnight (UTC) of the given attendance date. */
export const minutesSinceDayStart = (attendanceDate: string, time: Date): number =>
  Math.round((time.getTime() - new Date(`${attendanceDate}T00:00:00Z`).getTime()) / 60000);

const circularDistance = (a: number, b: number): number => {
  const diff = Math.abs((((a - b) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY);
  return Math.min(diff, MINUTES_PER_DAY - diff);
};

/**
 * Whether a punch (minutes since the attendance day's midnight) falls within
 * the shift window expanded by grace on both ends. The window is evaluated on
 * the shift-relative clock, so next-morning punches for night shifts work.
 */
export const punchWithinShiftWindow = (
  shift: ShiftTiming,
  relMinutes: number,
  grace: number = SHIFT_PUNCH_GRACE_MINUTES,
): boolean => {
  const start = timeToMinutes(shift.startTime);
  const duration = shiftDurationMinutes(shift);
  if (!Number.isFinite(start) || duration <= 0) return false;
  const rel = (((relMinutes - start) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return rel <= duration + grace || rel >= MINUTES_PER_DAY - grace;
};

/**
 * An out-punch belongs to the previous attendance day when the previous day
 * had a night shift whose end window (plus grace) covers the punch time.
 */
export const outPunchBelongsToPreviousDay = (
  punchMinutes: number,
  previousDayShifts: ShiftTiming[],
  grace: number = SHIFT_PUNCH_GRACE_MINUTES,
): boolean =>
  previousDayShifts.some((shift) => {
    if (!isNightTiming(shift)) return false;
    const end = timeToMinutes(shift.endTime);
    return punchMinutes <= end + grace;
  });

/** Group a day's punches into in→out sessions, in chronological order. */
export const pairPunchSessions = (punches: TimedPunch[]): PunchSession[] => {
  const sorted = [...punches].sort((a, b) => a.time.getTime() - b.time.getTime());
  const sessions: PunchSession[] = [];
  let pendingIns: TimedPunch[] = [];
  sorted.forEach((punch) => {
    if (punch.direction === 'in') {
      pendingIns.push(punch);
      return;
    }
    sessions.push({ inPunches: pendingIns, outPunches: [punch] });
    pendingIns = [];
  });
  if (pendingIns.length > 0) sessions.push({ inPunches: pendingIns, outPunches: [] });
  return sessions;
};

/**
 * Attribute each session to one same-day shift: the shift whose start is
 * nearest the session's first IN punch (orphan OUT sessions use the nearest
 * shift end). Returns session lists keyed by index into `shifts`.
 */
export const assignSessionsToShifts = <T extends ShiftTiming>(
  sessions: PunchSession[],
  shifts: T[],
  attendanceDate: string,
): Map<number, PunchSession[]> => {
  const result = new Map<number, PunchSession[]>();
  sessions.forEach((session) => {
    const inTime = session.inPunches[0]?.time ?? null;
    const outTime = session.outPunches[session.outPunches.length - 1]?.time ?? null;
    const anchor = inTime ?? outTime;
    if (!anchor) return;
    const anchorMinutes = minutesSinceDayStart(attendanceDate, anchor);
    let best = -1;
    let bestDistance = Infinity;
    shifts.forEach((shift, index) => {
      const reference = inTime ? timeToMinutes(shift.startTime) : timeToMinutes(shift.endTime);
      if (!Number.isFinite(reference)) return;
      const distance = circularDistance(anchorMinutes, reference);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    if (best < 0 && shifts.length > 0) best = 0;
    if (best >= 0) result.set(best, [...(result.get(best) ?? []), session]);
  });
  return result;
};

/**
 * Late / early-exit / overtime for one shift given its first IN and last OUT.
 * Wall-clock comparison — IN punches share the attendance date; night-shift
 * OUT punches land next morning so their wall-clock time is before the start.
 */
export const computeShiftMetrics = (
  shift: ShiftTiming | null,
  inTime: Date | null,
  outTime: Date | null,
  options: { skipLate?: boolean; skipEarlyOvertime?: boolean; sumSessions?: PunchSession[] } = {},
): ShiftMetrics => {
  let lateMinutes = 0;
  let earlyMinutes = 0;
  let overtimeMinutes = 0;

  if (inTime && shift?.startTime && !options.skipLate) {
    const shiftStart = timeToMinutes(shift.startTime);
    const inMin = inTime.getUTCHours() * 60 + inTime.getUTCMinutes();
    if (Number.isFinite(shiftStart) && inMin > shiftStart) lateMinutes = inMin - shiftStart;
  }

  if (outTime && shift?.endTime && !options.skipEarlyOvertime) {
    const shiftEnd = timeToMinutes(shift.endTime);
    const outMin = outTime.getUTCHours() * 60 + outTime.getUTCMinutes();
    if (Number.isFinite(shiftEnd)) {
      if (outMin < shiftEnd) earlyMinutes = shiftEnd - outMin;
      else if (outMin > shiftEnd) overtimeMinutes = outMin - shiftEnd;
    }
  }

  let workingDurationMinutes = 0;
  if (options.sumSessions) {
    options.sumSessions.forEach((session) => {
      const sessionIn = session.inPunches[0]?.time ?? null;
      const sessionOut = session.outPunches[session.outPunches.length - 1]?.time ?? null;
      if (sessionIn && sessionOut && sessionOut.getTime() > sessionIn.getTime()) {
        workingDurationMinutes += Math.round((sessionOut.getTime() - sessionIn.getTime()) / 60000);
      }
    });
  } else if (inTime && outTime && outTime.getTime() > inTime.getTime()) {
    workingDurationMinutes = Math.round((outTime.getTime() - inTime.getTime()) / 60000);
  } else if (inTime && outTime) {
    const inMin = inTime.getUTCHours() * 60 + inTime.getUTCMinutes();
    const outMin = outTime.getUTCHours() * 60 + outTime.getUTCMinutes();
    workingDurationMinutes = outMin >= inMin ? outMin - inMin : outMin + MINUTES_PER_DAY - inMin;
  }

  return { workingDurationMinutes, lateMinutes, earlyMinutes, overtimeMinutes };
};
