import { hasModuleAccess, hasPermission } from './hasPermission';
import type { PermissionAction, RolePermissions } from './types';

interface RoutePermission {
  path: string;
  module: string;
  item: string;
  action: PermissionAction;
}

/**
 * Maps application routes to the required module/item/action permission.
 * Dynamic segments use the Express-style `:id` placeholder; matching is handled
 * by converting the placeholder to a regex before testing the current location.
 */
export const ROUTE_PERMISSIONS: RoutePermission[] = [
  // Attendance
  { path: '/attendance', module: 'employees', item: 'employeeManagement', action: 'view' },
  { path: '/attendance/employees', module: 'employees', item: 'employeeManagement', action: 'view' },
  { path: '/attendance/employees/:id', module: 'employees', item: 'employeeManagement', action: 'view' },
  { path: '/attendance/records', module: 'attendanceLogs', item: 'rawPunches', action: 'view' },
  { path: '/attendance/shifts', module: 'shifts', item: 'shifts', action: 'view' },
  { path: '/attendance/leaves', module: 'leaves', item: 'leaves', action: 'view' },
  { path: '/attendance/leave-counts', module: 'leaves', item: 'leaves', action: 'view' },
  { path: '/attendance/devices', module: 'devices', item: 'devices', action: 'view' },
  { path: '/attendance/designations', module: 'masters', item: 'designations', action: 'view' },
  { path: '/attendance/departments', module: 'masters', item: 'departments', action: 'view' },
  { path: '/attendance/branches', module: 'masters', item: 'branches', action: 'view' },
  { path: '/attendance/reports', module: 'reports', item: 'monthlyReport', action: 'view' },
  { path: '/attendance/reports/preview/monthly', module: 'reports', item: 'monthlyReport', action: 'view' },
  { path: '/attendance/reports/preview/daily', module: 'reports', item: 'dailyReport', action: 'view' },
  { path: '/attendance/reports/preview/shifts', module: 'reports', item: 'shiftReport', action: 'view' },
  { path: '/attendance/reports/preview/employee-master', module: 'reports', item: 'employeeMasterReport', action: 'view' },
  { path: '/attendance/insights', module: 'insights', item: 'insights', action: 'view' },
  { path: '/attendance/change-tracker', module: 'attendanceLogs', item: 'changeTracker', action: 'view' },

  // DMS
  { path: '/dms', module: 'dms', item: 'whatsappMessenger', action: 'access' },
  { path: '/dms/workspace', module: 'dms', item: 'whatsappMessenger', action: 'access' },
  { path: '/dms/dashboard', module: 'dms', item: 'conversionInsights', action: 'view' },
  { path: '/dms/whatsapp-enquiry', module: 'dms', item: 'whatsappEnquiry', action: 'view' },
  { path: '/dms/lost-customers', module: 'dms', item: 'lostCustomers', action: 'view' },

  // Users
  { path: '/users', module: 'users', item: 'userManagement', action: 'view' },
];

function pathMatches(routePath: string, currentPath: string): boolean {
  if (routePath.includes(':id')) {
    const basePath = routePath.replace('/:id', '');
    const regex = new RegExp(`^${routePath.replace(/:id/g, '[^/]+')}$`);
    return regex.test(currentPath) || currentPath === basePath || currentPath.startsWith(basePath + '/');
  }
  return currentPath === routePath || currentPath.startsWith(routePath + '/');
}

export function checkRoutePermission(
  rolePermissions: RolePermissions | null | undefined,
  currentPath: string
): boolean {
  if (!rolePermissions) return false;

  // Find the most specific matching route permission.
  const matching = ROUTE_PERMISSIONS
    .filter((route) => pathMatches(route.path, currentPath))
    .sort((a, b) => b.path.length - a.path.length)[0];

  if (matching) {
    return hasPermission(rolePermissions, matching.module, matching.item, matching.action);
  }

  // For unmapped routes, allow only users with full access to everything (Director equivalent).
  const hasFullAccess = ROUTE_PERMISSIONS.every((route) =>
    hasPermission(rolePermissions, route.module, route.item, route.action)
  );
  return hasFullAccess;
}

/**
 * Returns true if the role has access to at least one route under a top-level module
 * (useful for sidebar visibility).
 */
export function hasTopLevelModuleAccess(
  rolePermissions: RolePermissions | null | undefined,
  moduleKey: 'attendance' | 'dms' | 'users'
): boolean {
  if (!rolePermissions) return false;

  if (moduleKey === 'dms') {
    return hasModuleAccess(rolePermissions, 'dms');
  }

  if (moduleKey === 'users') {
    return hasModuleAccess(rolePermissions, 'users');
  }

  // Attendance top-level nav should be visible if the user has access to any
  // attendance-related module (employees, attendanceLogs, shifts, leaves, reports,
  // insights, devices, or masters).
  return (
    hasModuleAccess(rolePermissions, 'employees') ||
    hasModuleAccess(rolePermissions, 'attendanceLogs') ||
    hasModuleAccess(rolePermissions, 'shifts') ||
    hasModuleAccess(rolePermissions, 'leaves') ||
    hasModuleAccess(rolePermissions, 'reports') ||
    hasModuleAccess(rolePermissions, 'insights') ||
    hasModuleAccess(rolePermissions, 'devices') ||
    hasModuleAccess(rolePermissions, 'masters')
  );
}
