import { describe, expect, it } from 'vitest';
import { hasPermission, hasModuleAccess } from './hasPermission';
import { normalizeRoleId } from './useRole';
import { EXAMPLE_USER_PERMISSIONS } from './testFixtures';
import type { UserPermissions } from './types';

describe('hasPermission', () => {
  it('grants full module access to all current and future items', () => {
    const perms: UserPermissions = {
      employees: { accessMode: 'full' },
    };
    expect(hasPermission(perms, 'employees', 'employeeManagement', 'view')).toBe(true);
    expect(hasPermission(perms, 'employees', 'employeeManagement', 'delete')).toBe(true);
    expect(hasPermission(perms, 'employees', 'futurePermission', 'view')).toBe(true);
    expect(hasPermission(perms, 'employees', 'futurePermission', 'add')).toBe(true);
  });

  it('does not grant future items under custom module access', () => {
    const perms: UserPermissions = {
      employees: {
        accessMode: 'custom',
        items: {
          employeeManagement: { actions: ['view'] },
        },
      },
    };
    expect(hasPermission(perms, 'employees', 'employeeManagement', 'view')).toBe(true);
    expect(hasPermission(perms, 'employees', 'futurePermission', 'view')).toBe(false);
  });

  it('denies access when module is missing', () => {
    expect(hasPermission({}, 'employees', 'employeeManagement', 'view')).toBe(false);
  });

  it('denies access when permissions are null or undefined', () => {
    expect(hasPermission(null, 'employees', 'employeeManagement', 'view')).toBe(false);
    expect(hasPermission(undefined, 'employees', 'employeeManagement', 'view')).toBe(false);
  });

  it('denies access when item is not granted in custom mode', () => {
    const perms: UserPermissions = {
      employees: {
        accessMode: 'custom',
        items: {
          employeeManagement: { actions: ['view'] },
        },
      },
    };
    expect(hasPermission(perms, 'employees', 'shiftAssignment', 'view')).toBe(false);
    expect(hasPermission(perms, 'employees', 'employeeManagement', 'edit')).toBe(false);
  });

  it('treats access as equivalent to view', () => {
    const perms: UserPermissions = {
      dms: {
        accessMode: 'custom',
        items: {
          whatsappMessenger: { actions: ['access'] },
        },
      },
    };
    expect(hasPermission(perms, 'dms', 'whatsappMessenger', 'view')).toBe(true);
    expect(hasPermission(perms, 'dms', 'whatsappMessenger', 'send')).toBe(false);
  });
});

describe('example user permission sets', () => {
  it('a Director-style user has full access to everything', () => {
    const perms = EXAMPLE_USER_PERMISSIONS.director;
    expect(hasPermission(perms, 'employees', 'employeeManagement', 'delete')).toBe(true);
    expect(hasPermission(perms, 'dms', 'whatsappMessenger', 'send')).toBe(true);
    expect(hasPermission(perms, 'users', 'roleManagement', 'edit')).toBe(true);
  });

  it('an HR-style user has full attendance access but no DMS access', () => {
    const perms = EXAMPLE_USER_PERMISSIONS.hr;
    expect(hasPermission(perms, 'employees', 'employeeManagement', 'delete')).toBe(true);
    expect(hasPermission(perms, 'reports', 'monthlyReport', 'export')).toBe(true);
    expect(hasPermission(perms, 'dms', 'whatsappMessenger', 'access')).toBe(false);
  });

  it('a Branch-Manager-style user can view but not delete raw punches', () => {
    const perms = EXAMPLE_USER_PERMISSIONS['branch-manager'];
    expect(hasPermission(perms, 'attendanceLogs', 'rawPunches', 'view')).toBe(true);
    expect(hasPermission(perms, 'attendanceLogs', 'rawPunches', 'add')).toBe(false);
  });

  it('a WhatsApp-Messager-style user has full DMS access', () => {
    const perms = EXAMPLE_USER_PERMISSIONS['whatsapp-messager'];
    expect(hasPermission(perms, 'dms', 'whatsappMessenger', 'access')).toBe(true);
    expect(hasPermission(perms, 'dms', 'whatsappMessenger', 'send')).toBe(true);
    expect(hasPermission(perms, 'dms', 'conversionInsights', 'view')).toBe(true);
    expect(hasPermission(perms, 'dms', 'futureDmsItem', 'view')).toBe(true);
    expect(hasPermission(perms, 'employees', 'employeeManagement', 'view')).toBe(false);
  });
});

describe('user permission isolation', () => {
  it('two users with the same role can have different permissions', () => {
    const userA: UserPermissions = {
      employees: {
        accessMode: 'custom',
        items: { employeeManagement: { actions: ['view', 'edit'] } },
      },
    };
    const userB: UserPermissions = {
      employees: {
        accessMode: 'custom',
        items: { employeeManagement: { actions: ['view'] } },
      },
      dms: {
        accessMode: 'custom',
        items: { whatsappMessenger: { actions: ['view', 'send'] } },
      },
    };

    expect(hasPermission(userA, 'employees', 'employeeManagement', 'edit')).toBe(true);
    expect(hasPermission(userB, 'employees', 'employeeManagement', 'edit')).toBe(false);
    expect(hasPermission(userB, 'dms', 'whatsappMessenger', 'send')).toBe(true);
    expect(hasPermission(userA, 'dms', 'whatsappMessenger', 'send')).toBe(false);
  });

  it('mutating one user permission tree never changes another user', () => {
    const userA: UserPermissions = {
      employees: { accessMode: 'custom', items: { employeeManagement: { actions: ['view'] } } },
    };
    const userB: UserPermissions = {
      employees: { accessMode: 'custom', items: { employeeManagement: { actions: ['view'] } } },
    };
    userA.employees!.items!.employeeManagement.actions.push('delete');
    expect(hasPermission(userA, 'employees', 'employeeManagement', 'delete')).toBe(true);
    expect(hasPermission(userB, 'employees', 'employeeManagement', 'delete')).toBe(false);
  });
});

describe('normalizeRoleId fallback', () => {
  it('returns canonical roleId for known roleId values', () => {
    expect(normalizeRoleId('director')).toBe('director');
    expect(normalizeRoleId('hr')).toBe('hr');
    expect(normalizeRoleId('operations-manager')).toBe('operations-manager');
    expect(normalizeRoleId('branch-manager')).toBe('branch-manager');
    expect(normalizeRoleId('whatsapp-messager')).toBe('whatsapp-messager');
  });

  it('falls back from legacy designation names to canonical roleIds', () => {
    expect(normalizeRoleId('Director')).toBe('director');
    expect(normalizeRoleId('HR')).toBe('hr');
    expect(normalizeRoleId('Operations Manager')).toBe('operations-manager');
    expect(normalizeRoleId('Branch Manager')).toBe('branch-manager');
    expect(normalizeRoleId('WhatsApp Messager')).toBe('whatsapp-messager');
  });

  it('returns null for empty values', () => {
    expect(normalizeRoleId('')).toBeNull();
    expect(normalizeRoleId(null)).toBeNull();
    expect(normalizeRoleId(undefined)).toBeNull();
  });

  it('preserves unknown values instead of granting a known role', () => {
    expect(normalizeRoleId('admin')).toBe('admin');
    expect(normalizeRoleId('unknown')).toBe('unknown');
  });
});

describe('hasModuleAccess', () => {
  it('returns true when module has full or custom access', () => {
    expect(hasModuleAccess({ employees: { accessMode: 'full' } }, 'employees')).toBe(true);
    expect(hasModuleAccess({ employees: { accessMode: 'custom', items: {} } }, 'employees')).toBe(false);
  });
});
