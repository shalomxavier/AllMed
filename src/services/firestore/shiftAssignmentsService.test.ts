import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Verifies the leave-wizard "Change Shift" rerouting:
 * Branch Managers must use the changeExistingShiftAssignment callable
 * (permission-checked + branch-scoped); other roles keep the direct
 * Firestore transaction path.
 */

const hoisted = vi.hoisted(() => {
  const callableMocks: Record<string, ReturnType<typeof vi.fn>> = {};
  const txUpdates: { kind: string; id: string; data: unknown }[] = [];
  const store: Record<string, Record<string, unknown>> = {};
  let idCounter = 0;
  return {
    callableMocks,
    txUpdates,
    store,
    nextId: () => `gen-${++idCounter}`,
  };
});

vi.mock('@/firebase/firebase', () => ({ db: { __db: true }, functions: { __fns: true } }));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_fns: unknown, name: string) => {
    const fn = vi.fn(async () => ({ data: {} }));
    hoisted.callableMocks[name] = fn;
    return fn;
  }),
}));

vi.mock('firebase/firestore', () => {
  const applyConds = (coll: string, conds: { field: string; op: string; value: unknown }[]) =>
    Object.entries(hoisted.store[coll] || {})
      .filter(([, d]) => conds.every((c) => (c.op === '==' ? (d as Record<string, unknown>)[c.field] === c.value : true)))
      .map(([id, data]) => ({ id, data: () => data }));
  return {
    collection: vi.fn((_db: unknown, name: string) => ({ __collection: name })),
    doc: vi.fn((first: Record<string, unknown>, ...rest: string[]) => {
      const coll = rest.length === 0 ? (first.__collection as string) : rest[rest.length - 2];
      const id = rest.length === 0 ? hoisted.nextId() : rest[rest.length - 1];
      return { __doc: coll, id, path: `${coll}/${id}` };
    }),
    getDocs: vi.fn(async (q: { __collection: string; conds?: { field: string; op: string; value: unknown }[] }) => {
      const docs = applyConds(q.__collection, q.conds ?? []);
      return { docs, size: docs.length, empty: docs.length === 0 };
    }),
    query: vi.fn((coll: { __collection: string }, ...conds: unknown[]) => ({ __collection: coll.__collection, conds })),
    where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
    orderBy: vi.fn(() => ({})),
    runTransaction: vi.fn(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { __doc: string; id: string }) => {
          const data = hoisted.store[ref.__doc]?.[ref.id];
          return { exists: () => data !== undefined, data: () => data, ref };
        },
        update: (ref: { id: string }, data: unknown) => {
          hoisted.txUpdates.push({ kind: 'update', id: ref.id, data });
        },
        set: (ref: { id: string }, data: unknown) => {
          hoisted.txUpdates.push({ kind: 'set', id: ref.id, data });
        },
      })
    ),
    serverTimestamp: vi.fn(() => 'TS'),
  };
});

import { runTransaction } from 'firebase/firestore';
import { shiftAssignmentsService } from './shiftAssignmentsService';

const ASSIGNMENT = { assignmentId: 'a1', employeeId: 'e1', employeeCode: 'E001', employeeName: 'Emp', fromDate: '2026-01-01', toDate: '2026-01-31' };

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.txUpdates.length = 0;
  hoisted.store.shifts = {
    s1: { startTime: '09:00', endTime: '17:00', employees: [{ ...ASSIGNMENT }] },
    s2: { startTime: '18:00', endTime: '22:00', employees: [] },
  };
});

describe('changeAssignmentForDateScoped', () => {
  it('routes branch managers through the changeExistingShiftAssignment callable', async () => {
    await shiftAssignmentsService.changeAssignmentForDateScoped(true, {
      employeeCode: 'E001',
      employeeId: 'e1',
      date: '2026-01-15',
      destinationShiftId: 's2',
      startTime: '18:00',
      endTime: '22:00',
    });

    const callable = hoisted.callableMocks['changeExistingShiftAssignmentForDate'];
    expect(callable).toHaveBeenCalledTimes(1);
    expect(callable).toHaveBeenCalledWith({
      employeeId: 'e1',
      sourceShiftId: 's1',
      destinationShiftId: 's2',
      assignmentId: 'a1',
      date: '2026-01-15',
    });
    expect(runTransaction).not.toHaveBeenCalled();
    expect(hoisted.txUpdates.length).toBe(0);
  });

  it('keeps the direct transaction path for non-branch-manager roles', async () => {
    await shiftAssignmentsService.changeAssignmentForDateScoped(false, {
      employeeCode: 'E001',
      date: '2026-01-15',
      destinationShiftId: 's2',
      startTime: '18:00',
      endTime: '22:00',
    });

    expect(hoisted.callableMocks['changeExistingShiftAssignmentForDate']).not.toHaveBeenCalled();
    expect(runTransaction).toHaveBeenCalledTimes(1);
    // Source slot gets the remaining segments; destination gets the override entry.
    expect(hoisted.txUpdates.length).toBe(2);
    const destWrite = hoisted.txUpdates.find((u) => u.id === 's2');
    expect(destWrite).toBeTruthy();
    expect((destWrite!.data as { employees: unknown[] }).employees.length).toBe(1);
  });

  it('surfaces resolution failures without calling the callable or writing', async () => {
    await expect(
      shiftAssignmentsService.changeAssignmentForDateScoped(true, {
        employeeCode: 'NOPE',
        employeeId: 'e9',
        date: '2026-01-15',
        destinationShiftId: 's2',
        startTime: '18:00',
        endTime: '22:00',
      })
    ).rejects.toThrow('No shift assignment covers the selected date.');

    expect(hoisted.callableMocks['changeExistingShiftAssignmentForDate']).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('requires an employee record id on the callable path', async () => {
    hoisted.store.shifts = {
      s1: { startTime: '09:00', endTime: '17:00', employees: [{ employeeCode: 'E001', fromDate: '2026-01-01', toDate: '2026-01-31' }] },
    };
    await expect(
      shiftAssignmentsService.changeAssignmentForDateScoped(true, {
        employeeCode: 'E001',
        date: '2026-01-15',
        destinationShiftId: 's2',
        startTime: '18:00',
        endTime: '22:00',
      })
    ).rejects.toThrow('Employee record not found.');
  });
});
