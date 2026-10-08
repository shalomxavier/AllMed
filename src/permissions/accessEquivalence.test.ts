import { describe, expect, it } from 'vitest';
import { checkRoutePermission } from './routePermissions';
import { DEFAULT_ROLE_PERMISSIONS } from './definitions';

const OLD_HR_PATHS = [
  '/attendance',
  '/attendance/employees',
  '/attendance/employees/abc123',
  '/attendance/records',
  '/attendance/shifts',
  '/attendance/leaves',
  '/attendance/devices',
  '/attendance/branches',
  '/attendance/designations',
  '/attendance/departments',
  '/attendance/reports',
  '/attendance/insights',
  '/attendance/change-tracker',
  '/attendance/reports/preview/monthly',
  '/attendance/reports/preview/daily',
  '/attendance/reports/preview/shifts',
  '/attendance/reports/preview/employee-master',
  '/users',
];

const OLD_OPERATIONS_MANAGER_PATHS = [
  '/dms',
  '/dms/workspace',
  '/dms/dashboard',
  '/dms/lost-customers',
  '/dms/whatsapp-enquiry',
  '/users',
];

const OLD_BRANCH_MANAGER_PATHS = [
  '/attendance',
  '/attendance/employees',
  '/attendance/employees/abc123',
  '/attendance/records',
  '/attendance/shifts',
  '/attendance/leaves',
  '/attendance/insights',
  '/attendance/reports',
  '/attendance/reports/preview/monthly',
  '/attendance/reports/preview/daily',
  '/attendance/reports/preview/shifts',
  '/attendance/reports/preview/employee-master',
];

const OLD_BRANCH_MANAGER_DENIED_PATHS = [
  '/attendance/devices',
  '/attendance/branches',
  '/attendance/designations',
  '/attendance/departments',
  '/attendance/change-tracker',
  '/users',
  '/dms',
];

const OLD_WHATSAPP_MESSAGER_PATHS = [
  '/dms',
  '/dms/workspace',
  '/dms/dashboard',
  '/dms/lost-customers',
  '/dms/whatsapp-enquiry',
];

describe('HR route equivalence', () => {
  it('allows all legacy HR routes', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.hr;
    for (const path of OLD_HR_PATHS) {
      expect(checkRoutePermission(perms, path)).toBe(true);
    }
  });

  it('denies DMS routes', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.hr;
    expect(checkRoutePermission(perms, '/dms')).toBe(false);
    expect(checkRoutePermission(perms, '/dms/workspace')).toBe(false);
  });
});

describe('Operations Manager route equivalence', () => {
  it('allows all legacy Operations Manager routes', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS['operations-manager'];
    for (const path of OLD_OPERATIONS_MANAGER_PATHS) {
      expect(checkRoutePermission(perms, path)).toBe(true);
    }
  });

  it('denies attendance routes', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS['operations-manager'];
    expect(checkRoutePermission(perms, '/attendance')).toBe(false);
    expect(checkRoutePermission(perms, '/attendance/employees')).toBe(false);
    expect(checkRoutePermission(perms, '/attendance/reports')).toBe(false);
  });
});

describe('Branch Manager route equivalence', () => {
  it('allows all legacy Branch Manager routes', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS['branch-manager'];
    for (const path of OLD_BRANCH_MANAGER_PATHS) {
      expect(checkRoutePermission(perms, path)).toBe(true);
    }
  });

  it('denies legacy Branch Manager restricted routes', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS['branch-manager'];
    for (const path of OLD_BRANCH_MANAGER_DENIED_PATHS) {
      expect(checkRoutePermission(perms, path)).toBe(false);
    }
  });
});

describe('WhatsApp Messager route equivalence', () => {
  it('allows all legacy WhatsApp Messager routes', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS['whatsapp-messager'];
    for (const path of OLD_WHATSAPP_MESSAGER_PATHS) {
      expect(checkRoutePermission(perms, path)).toBe(true);
    }
  });

  it('denies attendance and users routes', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS['whatsapp-messager'];
    expect(checkRoutePermission(perms, '/attendance')).toBe(false);
    expect(checkRoutePermission(perms, '/users')).toBe(false);
  });
});

describe('Director route equivalence', () => {
  it('allows all application routes', () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.director;
    const allPaths = [
      ...OLD_HR_PATHS,
      ...OLD_OPERATIONS_MANAGER_PATHS,
      ...OLD_BRANCH_MANAGER_PATHS,
      ...OLD_WHATSAPP_MESSAGER_PATHS,
      '/unknown-route',
    ];
    for (const path of allPaths) {
      expect(checkRoutePermission(perms, path)).toBe(true);
    }
  });
});
