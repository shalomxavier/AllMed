import { PERMISSION_MODULES } from './definitions';
import type { UserPermissions } from './types';

/**
 * Example user permission sets used by tests. These mirror the pre-migration
 * role defaults so route/UI equivalence tests keep their historical coverage,
 * but nothing in the runtime derives permissions from them.
 */
const FULL_ACCESS: UserPermissions = Object.fromEntries(
  PERMISSION_MODULES.map((module) => [module.key, { accessMode: 'full' as const }])
);

const BRANCH_MANAGER_A_PERMISSIONS: UserPermissions = {
  employees: {
    accessMode: 'custom',
    items: {
      employeeManagement: { actions: ['view', 'edit'] },
      shiftAssignment: { actions: ['view', 'add', 'edit', 'delete'] },
    },
  },
  attendanceLogs: {
    accessMode: 'custom',
    items: {
      rawPunches: { actions: ['view'] },
    },
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

const HR_PERMISSIONS: UserPermissions = {
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

const OPERATIONS_MANAGER_PERMISSIONS: UserPermissions = {
  dms: { accessMode: 'full' },
  users: {
    accessMode: 'custom',
    items: { userManagement: { actions: ['view', 'add', 'edit'] } },
  },
};

const WHATSAPP_MESSAGER_PERMISSIONS: UserPermissions = {
  dms: { accessMode: 'full' },
};

export const EXAMPLE_USER_PERMISSIONS: Record<string, UserPermissions> = {
  director: FULL_ACCESS,
  hr: HR_PERMISSIONS,
  'operations-manager': OPERATIONS_MANAGER_PERMISSIONS,
  'branch-manager': BRANCH_MANAGER_A_PERMISSIONS,
  'whatsapp-messager': WHATSAPP_MESSAGER_PERMISSIONS,
};
