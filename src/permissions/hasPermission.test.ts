import { describe, expect, it } from 'vitest';
import { hasPermission, hasModuleAccess } from './hasPermission';
import { normalizeRoleId } from './useRole';
import { DEFAULT_ROLE_PERMISSIONS } from './definitions';
import type { RolePermissions } from './types';

describe('hasPermission', () => {
  it('grants full module access to all current and future items', () => {
    const perms: RolePermissions = {
      employees: { accessMode: 'full' },
    };
    expect(hasPermission(perms, 'employees', 'employeeManagement', 'view')).toBe(true);
    expect(hasPermission(perms, 'employees', 'employeeManagement', 'delete')).toBe(true);
    expect(hasPermission(perms, 'employees', 'futurePermission', 'view')).toBe(true);
    expect(hasPermission(perms, 'employees', 'futurePermission', 'add')).toBe(true);
  });

  it('does not grant future items under custom module access', () => {
    const perms: RolePermissions = {
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

  it('denies access when item is not granted in custom mode', () => {
    const perms: RolePermissions = {
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
    const perms: RolePermissions = {
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

describe('default role permissions', () => {
  it('Director has full access to everything', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.director;
    expect(hasPermission(perms, 'employees', 'employeeManagement', 'delete')).toBe(true);
    expect(hasPermission(perms, 'dms', 'whatsappMessenger', 'send')).toBe(true);
    expect(hasPermission(perms, 'users', 'roleManagement', 'edit')).toBe(true);
  });

  it('HR has full attendance access but no DMS access', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.hr;
    expect(hasPermission(perms, 'employees', 'employeeManagement', 'delete')).toBe(true);
    expect(hasPermission(perms, 'reports', 'monthlyReport', 'export')).toBe(true);
    expect(hasPermission(perms, 'dms', 'whatsappMessenger', 'access')).toBe(false);
  });

  it('Branch Manager can view but not delete raw punches', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS['branch-manager'];
    expect(hasPermission(perms, 'attendanceLogs', 'rawPunches', 'view')).toBe(true);
    expect(hasPermission(perms, 'attendanceLogs', 'rawPunches', 'add')).toBe(false);
  });

  it('WhatsApp Messager has full DMS access to preserve legacy route list', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS['whatsapp-messager'];
    expect(hasPermission(perms, 'dms', 'whatsappMessenger', 'access')).toBe(true);
    expect(hasPermission(perms, 'dms', 'whatsappMessenger', 'send')).toBe(true);
    expect(hasPermission(perms, 'dms', 'conversionInsights', 'view')).toBe(true);
    expect(hasPermission(perms, 'dms', 'futureDmsItem', 'view')).toBe(true);
    expect(hasPermission(perms, 'employees', 'employeeManagement', 'view')).toBe(false);
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
