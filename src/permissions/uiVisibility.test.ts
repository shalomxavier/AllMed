import { describe, expect, it } from 'vitest';
import { hasPermission } from './hasPermission';
import { EXAMPLE_USER_PERMISSIONS } from './testFixtures';
import { ROLE_IDS } from './definitions';
import type { PermissionAction, UserPermissions } from './types';

/**
 * Regression coverage for the UI-visibility audit.
 *
 * Every gated UI control renders if and only if hasPermission() returns true
 * for its mapped permission. This matrix pins the expected visibility of each
 * audited control for representative user permission sets, so a change to the
 * permission mapping is caught here rather than in the UI.
 *
 * UI visibility is driven entirely by the user's own permission tree.
 */

const visible = (
  permissions: UserPermissions,
  module: string,
  item: string,
  action: PermissionAction
) => hasPermission(permissions, module, item, action);

interface Case {
  control: string;
  module: string;
  item: string;
  action: PermissionAction;
  expected: Record<string, boolean>;
}

const NONE = { director: false, hr: false, 'operations-manager': false, 'branch-manager': false, 'whatsapp-messager': false };

const CASES: Case[] = [
  // EmployeesPage
  { control: 'EmployeesPage: Edit employee icon', module: 'employees', item: 'employeeManagement', action: 'edit',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'EmployeesPage: card Shifts button', module: 'employees', item: 'shiftAssignment', action: 'view',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'EmployeesPage: Assign Shifts / Add Shift / Assign submit', module: 'employees', item: 'shiftAssignment', action: 'add',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'EmployeesPage: shift record Edit', module: 'employees', item: 'shiftAssignment', action: 'edit',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'EmployeesPage: shift record Delete + confirm', module: 'employees', item: 'shiftAssignment', action: 'delete',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'EmployeesPage: card Leave / Week Off button', module: 'leaves', item: 'leaves', action: 'view',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'EmployeesPage: Add Leaves + bulk submit + wizard leave menu', module: 'leaves', item: 'leaves', action: 'add',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'EmployeesPage: saved leave Edit (multi-date)', module: 'leaves', item: 'leaves', action: 'edit',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'EmployeesPage: saved leave Remove (single-date)', module: 'leaves', item: 'leaves', action: 'delete',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'EmployeesPage: New Shift tab + Save Shift (new mode)', module: 'shifts', item: 'shifts', action: 'add',
    expected: { ...NONE, director: true, hr: true } },

  // ShiftsPage
  { control: 'ShiftsPage: Add Shifts button', module: 'shifts', item: 'shifts', action: 'add',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'ShiftsPage: Edit slot / Update Shift', module: 'shifts', item: 'shifts', action: 'edit',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'ShiftsPage: Delete slot', module: 'shifts', item: 'shifts', action: 'delete',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'ShiftsPage: Add Employees / Assign submit', module: 'employees', item: 'shiftAssignment', action: 'add',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'ShiftsPage: Remove employee / Edit Employees', module: 'employees', item: 'shiftAssignment', action: 'delete',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'ShiftsPage: wizard Change Shift', module: 'employees', item: 'shiftAssignment', action: 'edit',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'ShiftsPage: wizard leave option menus', module: 'leaves', item: 'leaves', action: 'add',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },

  // RawPunchesPage
  { control: 'RawPunchesPage: Add punch', module: 'attendanceLogs', item: 'rawPunches', action: 'add',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'RawPunchesPage: Edit punch / Analyze Fix', module: 'attendanceLogs', item: 'rawPunches', action: 'edit',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'RawPunchesPage: Delete punch', module: 'attendanceLogs', item: 'rawPunches', action: 'delete',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'RawPunchesPage: Alterations nav', module: 'attendanceLogs', item: 'changeTracker', action: 'view',
    expected: { ...NONE, director: true, hr: true } },

  // LeavesPage
  { control: 'LeavesPage: Add Leaves + calendar Add Leave + bulk submit', module: 'leaves', item: 'leaves', action: 'add',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'LeavesPage: Edit leave + Save Changes', module: 'leaves', item: 'leaves', action: 'edit',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'LeavesPage: Delete leave + confirm', module: 'leaves', item: 'leaves', action: 'delete',
    expected: { ...NONE, director: true, hr: true } },

  // LeaveCountsPage
  { control: 'LeaveCountsPage: Add limit', module: 'leaves', item: 'leaveLimits', action: 'add',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'LeaveCountsPage: Edit limit', module: 'leaves', item: 'leaveLimits', action: 'edit',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'LeaveCountsPage: Delete limit', module: 'leaves', item: 'leaveLimits', action: 'delete',
    expected: { ...NONE, director: true, hr: true } },

  // Masters pages
  { control: 'BranchesPage: Add/Edit/Delete + Save', module: 'masters', item: 'branches', action: 'add',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'BranchesPage: row Edit', module: 'masters', item: 'branches', action: 'edit',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'BranchesPage: row Delete', module: 'masters', item: 'branches', action: 'delete',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'DesignationsPage: Add/Edit/Delete + Save', module: 'masters', item: 'designations', action: 'add',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'DepartmentsPage: Add/Edit/Delete + Save', module: 'masters', item: 'departments', action: 'add',
    expected: { ...NONE, director: true, hr: true } },

  // DevicesPage
  { control: 'DevicesPage: Register Device', module: 'devices', item: 'devices', action: 'add',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'DevicesPage: Edit', module: 'devices', item: 'devices', action: 'edit',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'DevicesPage: Delete', module: 'devices', item: 'devices', action: 'delete',
    expected: { ...NONE, director: true, hr: true } },

  // ReportsPage
  { control: 'ReportsPage: View Monthly Report', module: 'reports', item: 'monthlyReport', action: 'view',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'ReportsPage: Export Monthly Report', module: 'reports', item: 'monthlyReport', action: 'export',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'ReportsPage: Export Attendance Log', module: 'reports', item: 'dailyReport', action: 'export',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'ReportsPage: Export Shift Report', module: 'reports', item: 'shiftReport', action: 'export',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },
  { control: 'ReportsPage: Export Employee Master', module: 'reports', item: 'employeeMasterReport', action: 'export',
    expected: { ...NONE, director: true, hr: true, 'branch-manager': true } },

  // Sidebar master sub-items
  { control: 'Sidebar: Master > Branches', module: 'masters', item: 'branches', action: 'view',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'Sidebar: Master > Designations', module: 'masters', item: 'designations', action: 'view',
    expected: { ...NONE, director: true, hr: true } },
  { control: 'Sidebar: Master > Departments', module: 'masters', item: 'departments', action: 'view',
    expected: { ...NONE, director: true, hr: true } },

  // DMS
  { control: 'WorkspacePage: message input', module: 'dms', item: 'whatsappMessenger', action: 'send',
    expected: { ...NONE, director: true, 'operations-manager': true, 'whatsapp-messager': true } },
  { control: 'WorkspacePage: Converted/Lost/Active status actions + LostReason save', module: 'dms', item: 'whatsappMessenger', action: 'manage',
    expected: { ...NONE, director: true, 'operations-manager': true, 'whatsapp-messager': true } },
  { control: 'WhatsAppEnquiryPage: message input', module: 'dms', item: 'whatsappEnquiry', action: 'edit',
    expected: { ...NONE, director: true, 'operations-manager': true, 'whatsapp-messager': true } },
  { control: 'DMSPage: Conversion Insights tile', module: 'dms', item: 'conversionInsights', action: 'view',
    expected: { ...NONE, director: true, 'operations-manager': true, 'whatsapp-messager': true } },

  // UsersPage
  { control: 'UsersPage: Add User + Add User submit', module: 'users', item: 'userManagement', action: 'add',
    expected: { ...NONE, director: true, hr: true, 'operations-manager': true } },
  { control: 'UsersPage: Edit user + Save Changes + view-modal Edit', module: 'users', item: 'userManagement', action: 'edit',
    expected: { ...NONE, director: true, hr: true, 'operations-manager': true } },
  { control: 'UsersPage: user permission assignment authority', module: 'users', item: 'roleManagement', action: 'edit',
    expected: { ...NONE, director: true } },
];

describe('UI-visibility matrix', () => {
  for (const c of CASES) {
    it(`${c.control} → ${c.module}.${c.item}.${c.action}`, () => {
      for (const key of Object.values(ROLE_IDS)) {
        expect(
          visible(EXAMPLE_USER_PERMISSIONS[key], c.module, c.item, c.action),
          `${key} ${c.control}`,
        ).toBe(c.expected[key]);
      }
    });
  }

  it('a full-access user sees every audited control', () => {
    for (const c of CASES) {
      expect(visible(EXAMPLE_USER_PERMISSIONS.director, c.module, c.item, c.action), c.control).toBe(true);
    }
  });
});

describe('UI visibility driven by direct user permissions', () => {
  it('a user with an individually granted action sees the control', () => {
    const userPermissions: UserPermissions = {
      attendanceLogs: {
        accessMode: 'custom',
        items: { rawPunches: { actions: ['delete'] } },
      },
    };
    expect(visible(userPermissions, 'attendanceLogs', 'rawPunches', 'delete')).toBe(true);
  });

  it('a user without the grant does not see the control, regardless of role', () => {
    const userPermissions: UserPermissions = {
      attendanceLogs: {
        accessMode: 'custom',
        items: { rawPunches: { actions: ['view'] } },
      },
    };
    expect(visible(userPermissions, 'attendanceLogs', 'rawPunches', 'delete')).toBe(false);
  });

  it('a user granted nothing sees no controls', () => {
    for (const c of CASES) {
      expect(visible({}, c.module, c.item, c.action), c.control).toBe(false);
    }
  });
});
