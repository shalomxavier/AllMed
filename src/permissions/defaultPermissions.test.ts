import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_IDS } from './definitions';
import { getDefaultPermissions, getModuleState, isActionChecked, permissionsEqual } from './permissionEditor';
import { hasPermission } from './hasPermission';
import type { UserPermissions } from './types';

/**
 * Regression tests for the role default templates used by the user editor.
 * The expected trees are the exact permission sets recovered from the
 * original RBAC implementation (b3cf935:src/permissions/definitions.ts).
 */

const EXPECTED_BM: UserPermissions = {
  employees: {
    accessMode: 'custom',
    items: {
      employeeManagement: { actions: ['view', 'edit'] },
      shiftAssignment: { actions: ['view', 'add', 'edit', 'delete'] },
    },
  },
  attendanceLogs: {
    accessMode: 'custom',
    items: { rawPunches: { actions: ['view'] } },
  },
  shifts: {
    accessMode: 'custom',
    items: { shifts: { actions: ['view', 'edit'] } },
  },
  leaves: {
    accessMode: 'custom',
    items: {
      leaves: { actions: ['view', 'add', 'edit'] },
      weekOffs: { actions: ['view', 'add', 'edit'] },
      leaveLimits: { actions: ['view'] },
    },
  },
  reports: {
    accessMode: 'custom',
    items: {
      monthlyReport: { actions: ['view', 'export'] },
      dailyReport: { actions: ['view', 'export'] },
      shiftReport: { actions: ['view', 'export'] },
      employeeMasterReport: { actions: ['view', 'export'] },
    },
  },
  insights: { accessMode: 'full' },
};

const EXPECTED_HR: UserPermissions = {
  employees: { accessMode: 'full' },
  attendanceLogs: { accessMode: 'full' },
  shifts: { accessMode: 'full' },
  leaves: { accessMode: 'full' },
  reports: { accessMode: 'full' },
  insights: { accessMode: 'full' },
  devices: { accessMode: 'full' },
  masters: { accessMode: 'full' },
  users: {
    accessMode: 'custom',
    items: { userManagement: { actions: ['view', 'add', 'edit', 'delete'] } },
  },
};

const EXPECTED_OPS: UserPermissions = {
  dms: { accessMode: 'full' },
  users: {
    accessMode: 'custom',
    items: { userManagement: { actions: ['view', 'add', 'edit'] } },
  },
};

const EXPECTED_MESSAGER: UserPermissions = {
  dms: { accessMode: 'full' },
};

describe('DEFAULT_ROLE_PERMISSIONS', () => {
  it('covers all five designations', () => {
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS).sort()).toEqual(
      ['branch-manager', 'director', 'hr', 'operations-manager', 'whatsapp-messager'].sort(),
    );
  });

  it('director gets full access on all ten modules', () => {
    const defaults = DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.DIRECTOR];
    expect(Object.keys(defaults)).toHaveLength(10);
    expect(Object.values(defaults).every((m) => m?.accessMode === 'full')).toBe(true);
    expect(hasPermission(defaults, 'users', 'roleManagement', 'edit')).toBe(true);
  });

  it('branch manager matches the corrected six-module set exactly', () => {
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.BRANCH_MANAGER]).toEqual(EXPECTED_BM);
    // Must never regress to the erroneous all-ten-modules production grant.
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.BRANCH_MANAGER].users).toBeUndefined();
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.BRANCH_MANAGER].dms).toBeUndefined();
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.BRANCH_MANAGER].devices).toBeUndefined();
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.BRANCH_MANAGER].masters).toBeUndefined();
  });

  it('hr matches the recovered default (nine modules, no DMS)', () => {
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.HR]).toEqual(EXPECTED_HR);
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.HR].dms).toBeUndefined();
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.HR], 'users', 'roleManagement', 'edit')).toBe(false);
  });

  it('operations manager matches the recovered default', () => {
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.OPERATIONS_MANAGER]).toEqual(EXPECTED_OPS);
  });

  it('whatsapp messager matches the recovered default', () => {
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.WHATSAPP_MESSAGER]).toEqual(EXPECTED_MESSAGER);
  });
});

describe('getDefaultPermissions', () => {
  it('returns an empty tree for empty or unknown roles (no broad default)', () => {
    expect(getDefaultPermissions('')).toEqual({});
    expect(getDefaultPermissions(undefined)).toEqual({});
    expect(getDefaultPermissions(null)).toEqual({});
    expect(getDefaultPermissions('nonexistent-role')).toEqual({});
  });

  it('returns a deep copy — mutating the result never touches the template', () => {
    const copy = getDefaultPermissions(ROLE_IDS.BRANCH_MANAGER);
    copy.employees = { accessMode: 'full' };
    copy.insights!.accessMode = 'custom';
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.BRANCH_MANAGER]).toEqual(EXPECTED_BM);
    expect(getDefaultPermissions(ROLE_IDS.BRANCH_MANAGER)).toEqual(EXPECTED_BM);
  });

  it('the BM template renders as custom/partial in the editor with the right actions checked', () => {
    const defaults = getDefaultPermissions(ROLE_IDS.BRANCH_MANAGER);
    expect(getModuleState(defaults, 'employees')).toBe('partial');
    expect(getModuleState(defaults, 'insights')).toBe('full');
    expect(getModuleState(defaults, 'dms')).toBe('none');
    expect(isActionChecked(defaults, 'employees', 'employeeManagement', 'edit')).toBe(true);
    expect(isActionChecked(defaults, 'employees', 'employeeManagement', 'add')).toBe(false);
    // insights is full → every defined action checked, including future ones.
    expect(isActionChecked(defaults, 'insights', 'insights', 'view')).toBe(true);
  });
});

describe('permissionsEqual', () => {
  it('detects equality regardless of key order', () => {
    const reordered: UserPermissions = {
      insights: { accessMode: 'full' },
      employees: {
        accessMode: 'custom',
        items: {
          shiftAssignment: { actions: ['delete', 'edit', 'add', 'view'] },
          employeeManagement: { actions: ['edit', 'view'] },
        },
      },
      attendanceLogs: { accessMode: 'custom', items: { rawPunches: { actions: ['view'] } } },
      shifts: { accessMode: 'custom', items: { shifts: { actions: ['edit', 'view'] } } },
      leaves: EXPECTED_BM.leaves,
      reports: EXPECTED_BM.reports,
    };
    expect(permissionsEqual(reordered, EXPECTED_BM)).toBe(true);
  });

  it('detects differences', () => {
    expect(permissionsEqual(EXPECTED_BM, EXPECTED_HR)).toBe(false);
    expect(permissionsEqual({}, EXPECTED_BM)).toBe(false);
    expect(permissionsEqual(null, undefined)).toBe(true);
  });
});
