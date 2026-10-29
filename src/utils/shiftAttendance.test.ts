import { describe, expect, it } from 'vitest';
import {
  assignSessionsToShifts,
  computeShiftMetrics,
  isNightTiming,
  outPunchBelongsToPreviousDay,
  pairPunchSessions,
  punchWithinShiftWindow,
  shiftDurationMinutes,
  type TimedPunch,
} from './shiftAttendance';

const DATE = '2026-10-15';
const utc = (time: string) => new Date(`${DATE}T${time}:00Z`);
const nextDay = (time: string) => new Date(`2026-10-16T${time}:00Z`);

const punch = (id: string, time: Date, direction: 'in' | 'out'): TimedPunch => ({ id, time, direction });

const dayShift = { id: 'day', startTime: '09:00', endTime: '13:00' };
const eveningShift = { id: 'evening', startTime: '14:00', endTime: '20:00' };
const nightShift = { id: 'night', startTime: '22:00', endTime: '06:00' };

describe('isNightTiming / shiftDurationMinutes', () => {
  it('detects night shifts and computes wrapped durations', () => {
    expect(isNightTiming(nightShift)).toBe(true);
    expect(isNightTiming(dayShift)).toBe(false);
    expect(shiftDurationMinutes(nightShift)).toBe(8 * 60);
    expect(shiftDurationMinutes(dayShift)).toBe(4 * 60);
  });
});

describe('pairPunchSessions', () => {
  it('pairs in→out chronologically', () => {
    const sessions = pairPunchSessions([
      punch('1', utc('09:00'), 'in'),
      punch('2', utc('13:05'), 'out'),
      punch('3', utc('14:00'), 'in'),
      punch('4', utc('20:00'), 'out'),
    ]);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].outPunches[0].id).toBe('2');
    expect(sessions[1].inPunches[0].id).toBe('3');
  });

  it('keeps orphan punches as open sessions', () => {
    const sessions = pairPunchSessions([punch('1', utc('09:00'), 'in')]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].outPunches).toHaveLength(0);
  });
});

describe('assignSessionsToShifts', () => {
  const shifts = [dayShift, eveningShift];

  it('attributes each session to the shift nearest its IN punch', () => {
    const sessions = pairPunchSessions([
      punch('1', utc('09:00'), 'in'),
      punch('2', utc('13:05'), 'out'),
      punch('3', utc('14:00'), 'in'),
      punch('4', utc('20:00'), 'out'),
    ]);
    const byShift = assignSessionsToShifts(sessions, shifts, DATE);
    expect(byShift.get(0)).toHaveLength(1);
    expect(byShift.get(1)).toHaveLength(1);
    expect(byShift.get(0)![0].inPunches[0].id).toBe('1');
    expect(byShift.get(1)![0].inPunches[0].id).toBe('3');
  });

  it('assigns a spanning session to the first (nearest-start) shift', () => {
    const sessions = pairPunchSessions([
      punch('1', utc('09:00'), 'in'),
      punch('2', utc('20:00'), 'out'),
    ]);
    const byShift = assignSessionsToShifts(sessions, shifts, DATE);
    expect(byShift.get(0)).toHaveLength(1);
    expect(byShift.get(1)).toBeUndefined();
  });

  it('attributes an orphan OUT to the nearest shift end', () => {
    const sessions = pairPunchSessions([punch('1', utc('13:10'), 'out')]);
    const byShift = assignSessionsToShifts(sessions, shifts, DATE);
    expect(byShift.get(0)).toHaveLength(1);
  });
});

describe('computeShiftMetrics', () => {
  it('computes per-session working duration', () => {
    const sessions = pairPunchSessions([
      punch('1', utc('09:00'), 'in'),
      punch('2', utc('13:00'), 'out'),
      punch('3', utc('13:30'), 'in'),
      punch('4', utc('13:50'), 'out'),
    ]);
    const metrics = computeShiftMetrics(dayShift, utc('09:00'), utc('13:50'), { sumSessions: sessions });
    expect(metrics.workingDurationMinutes).toBe(4 * 60 + 20);
  });

  it('scores late and overtime against the shift window', () => {
    const metrics = computeShiftMetrics(dayShift, utc('09:15'), utc('13:45'));
    expect(metrics.lateMinutes).toBe(15);
    expect(metrics.overtimeMinutes).toBe(45);
    expect(metrics.earlyMinutes).toBe(0);
  });
});

describe('outPunchBelongsToPreviousDay', () => {
  it('attributes early-morning outs to a previous night shift', () => {
    expect(outPunchBelongsToPreviousDay(5 * 60 + 30, [nightShift])).toBe(true);
    expect(outPunchBelongsToPreviousDay(5 * 60 + 30, [dayShift])).toBe(false);
    // Past the end+grace window the punch belongs to its own day.
    expect(outPunchBelongsToPreviousDay(9 * 60, [nightShift])).toBe(false);
  });
});

describe('punchWithinShiftWindow', () => {
  it('accepts punches inside the window plus grace', () => {
    expect(punchWithinShiftWindow(dayShift, 9 * 60)).toBe(true);
    expect(punchWithinShiftWindow(dayShift, 13 * 60 + 119)).toBe(true);
    expect(punchWithinShiftWindow(dayShift, 8 * 60 - 59)).toBe(true);
    expect(punchWithinShiftWindow(dayShift, 16 * 60)).toBe(false);
  });
});

describe('night-shift multi-shift day', () => {
  it('attributes evening IN and next-morning OUT to the night shift', () => {
    const shifts = [dayShift, nightShift];
    const sessions = pairPunchSessions([
      punch('1', utc('09:00'), 'in'),
      punch('2', utc('13:00'), 'out'),
      punch('3', utc('22:05'), 'in'),
      punch('4', nextDay('06:10'), 'out'),
    ]);
    const byShift = assignSessionsToShifts(sessions, shifts, DATE);
    expect(byShift.get(0)).toHaveLength(1);
    expect(byShift.get(1)).toHaveLength(1);
    expect(byShift.get(1)![0].outPunches[0].id).toBe('4');
  });
});
