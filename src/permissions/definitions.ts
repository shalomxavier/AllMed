import type { PermissionAction, UserPermissions } from './types';

export interface PermissionDefinition {
  key: string;
  label: string;
  actions: PermissionAction[];
}

export interface PermissionModule {
  key: string;
  label: string;
  items: PermissionDefinition[];
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    key: 'employees',
    label: 'Employees',
    items: [
      { key: 'employeeManagement', label: 'Employee Management', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'shiftAssignment', label: 'Shift Assignment', actions: ['view', 'add', 'edit', 'delete'] },
    ],
  },
  {
    key: 'attendanceLogs',
    label: 'Attendance Logs',
    items: [
      { key: 'rawPunches', label: 'Raw Punches / Logs', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'changeTracker', label: 'Change Tracker', actions: ['view', 'add', 'edit', 'delete'] },
    ],
  },
  {
    key: 'shifts',
    label: 'Shifts',
    items: [{ key: 'shifts', label: 'Shift Management', actions: ['view', 'add', 'edit', 'delete'] }],
  },
  {
    key: 'leaves',
    label: 'Week Off / Leave',
    items: [
      { key: 'leaves', label: 'Leave Management', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'weekOffs', label: 'Week Off Management', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'leaveLimits', label: 'Leave Limits', actions: ['view', 'add', 'edit', 'delete'] },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    items: [
      { key: 'monthlyReport', label: 'Monthly Work Duration', actions: ['view', 'export'] },
      { key: 'dailyReport', label: 'Daily Attendance', actions: ['view', 'export'] },
      { key: 'shiftReport', label: 'Shift Report', actions: ['view', 'export'] },
      { key: 'employeeMasterReport', label: 'Employee Master', actions: ['view', 'export'] },
    ],
  },
  {
    key: 'insights',
    label: 'Insights',
    items: [{ key: 'insights', label: 'Attendance Insights', actions: ['view'] }],
  },
  {
    key: 'devices',
    label: 'Devices',
    items: [{ key: 'devices', label: 'Device Management', actions: ['view', 'add', 'edit', 'delete'] }],
  },
  {
    key: 'masters',
    label: 'Masters Management',
    items: [
      { key: 'branches', label: 'Branches', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'designations', label: 'Designations', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'departments', label: 'Departments', actions: ['view', 'add', 'edit', 'delete'] },
    ],
  },
  {
    key: 'dms',
    label: 'DMS',
    items: [
      { key: 'whatsappMessenger', label: 'WhatsApp Messenger', actions: ['access', 'send', 'manage'] },
      { key: 'conversionInsights', label: 'Conversion Insights', actions: ['view'] },
      { key: 'whatsappEnquiry', label: 'WhatsApp Enquiry', actions: ['view', 'edit'] },
      { key: 'lostCustomers', label: 'Lost Customers', actions: ['view', 'edit'] },
    ],
  },
  {
    key: 'users',
    label: 'Users',
    items: [
      { key: 'userManagement', label: 'User Management', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'roleManagement', label: 'Role Management', actions: ['view', 'edit'] },
    ],
  },
];

export const ROLE_IDS = {
  DIRECTOR: 'director',
  HR: 'hr',
  OPERATIONS_MANAGER: 'operations-manager',
  BRANCH_MANAGER: 'branch-manager',
  WHATSAPP_MESSAGER: 'whatsapp-messager',
} as const;

export const ROLE_NAMES: Record<string, string> = {
  [ROLE_IDS.DIRECTOR]: 'Director',
  [ROLE_IDS.HR]: 'HR',
  [ROLE_IDS.OPERATIONS_MANAGER]: 'Operations Manager',
  [ROLE_IDS.BRANCH_MANAGER]: 'Branch Manager',
  [ROLE_IDS.WHATSAPP_MESSAGER]: 'WhatsApp Messager',
};

// Roles exist for user identity/administration only. They never grant module
// permissions — every user's access comes from users/{uid}.permissions.
export const FIXED_ROLES = Object.entries(ROLE_NAMES).map(([id, name]) => ({
  id,
  name,
  isFixed: true,
}));

// ---------------------------------------------------------------------------
// Default permission templates per role, recovered verbatim from the original
// RBAC implementation (b3cf935:src/permissions/definitions.ts).
//
// IMPORTANT: these are editor templates only. They are used to pre-fill the
// permission tree in the user-management UI and by "Reset to Default
// Permissions". They are NEVER consulted for authorization — runtime access
// comes solely from users/{uid}.permissions.
// ---------------------------------------------------------------------------

const FULL_ACCESS: UserPermissions = Object.fromEntries(
  PERMISSION_MODULES.map((module) => [module.key, { accessMode: 'full' as const }])
);

// Branch Manager: attendance access except devices/masters; DMS none; users none
const BRANCH_MANAGER_PERMISSIONS: UserPermissions = {
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

// HR: full attendance access incl masters, users, no DMS
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

// Operations Manager: DMS full, users view/add/edit, no attendance
const OPERATIONS_MANAGER_PERMISSIONS: UserPermissions = {
  dms: { accessMode: 'full' },
  users: {
    accessMode: 'custom',
    items: { userManagement: { actions: ['view', 'add', 'edit'] } },
  },
};

// WhatsApp Messager: full DMS access (preserves legacy route list for this role)
const WHATSAPP_MESSAGER_PERMISSIONS: UserPermissions = {
  dms: { accessMode: 'full' },
};

export const DEFAULT_ROLE_PERMISSIONS: Record<string, UserPermissions> = {
  [ROLE_IDS.DIRECTOR]: FULL_ACCESS,
  [ROLE_IDS.HR]: HR_PERMISSIONS,
  [ROLE_IDS.OPERATIONS_MANAGER]: OPERATIONS_MANAGER_PERMISSIONS,
  [ROLE_IDS.BRANCH_MANAGER]: BRANCH_MANAGER_PERMISSIONS,
  [ROLE_IDS.WHATSAPP_MESSAGER]: WHATSAPP_MESSAGER_PERMISSIONS,
};
