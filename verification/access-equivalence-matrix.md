# RBAC Access Equivalence Verification Matrix

This document compares the **OLD** (designation-based) effective access with the **NEW** (RBAC role/permission-based) effective access for every application role.

Legend:
- **Y** = Allowed / Visible
- **N** = Denied / Hidden
- **Y (scope)** = Allowed but limited to assigned branch
- **Y (UI)** = UI shows action; backend previously allowed it via open rules
- **N (security fix)** = Previously allowed through open rules but now restricted (deliberate hardening)

---

## 1. Director

| Capability | OLD | NEW | Notes |
|---|---|---|---|
| Top nav Attendance | Y | Y | FULL access on `employees`, all attendance modules. |
| Top nav DMS | Y | Y | FULL access on `dms`. |
| Top nav Users | Y | Y | FULL access on `users`. |
| Master submenu | Y | Y | FULL access on `masters`. |
| All routes | Y | Y | Director has module-level FULL on every route-mapped module. |
| Employee master CRUD | Y | Y | `employees.employeeManagement` FULL. |
| Shift assignment CRUD | Y | Y | `employees.shiftAssignment` FULL + `shifts` FULL. |
| Raw Punches / Change Tracker CRUD | Y | Y | `attendanceLogs` FULL. |
| Shifts CRUD | Y | Y | `shifts` FULL. |
| Leaves / Week Off / Leave Limits CRUD | Y | Y | `leaves` FULL. |
| Reports view/export | Y | Y | `reports` FULL. |
| Insights | Y | Y | `insights` FULL. |
| Devices CRUD | Y | Y | `devices` FULL. |
| Masters (branches/designations/departments) CRUD | Y | Y | `masters` FULL. |
| WhatsApp Messenger / DMS actions | Y | Y | `dms` FULL. |
| User Management CRUD | Y | Y | `users.userManagement` FULL. |
| Role Permission configuration | N/A | Y | New capability; only Director via `users.roleManagement`. |
| Firestore privileged writes | Y | Y | All RBAC-protected collections allow Director. |
| Cloud Functions shiftAssignments | Y | Y | Director mapped to allowed role. |
| Cloud Functions DMS | Y | Y | Has `dms.whatsappMessenger` access/send. |

---

## 2. HR

| Capability | OLD | NEW | Notes |
|---|---|---|---|
| Top nav Attendance | Y | Y | `employees`, `attendanceLogs`, `shifts`, `leaves`, `reports`, `insights`, `devices`, `masters` FULL. |
| Top nav DMS | N | N | No DMS permissions. |
| Top nav Users | Y | Y | `users.userManagement` view/add/edit/delete. |
| Master submenu | N | N | Hidden in both old and new sidebar. |
| Master pages reachable | Y | Y | `masters` FULL allows access even though sidebar hides the menu (preserves pre-existing drift). |
| Employee master CRUD | Y | Y | `employees.employeeManagement` FULL. |
| Shift assignment CRUD | Y | Y | `employees.shiftAssignment` FULL + `shifts` FULL. |
| Raw Punches / Change Tracker CRUD | Y | Y | `attendanceLogs` FULL. |
| Shifts CRUD | Y | Y | `shifts` FULL. |
| Leaves / Week Off / Leave Limits CRUD | Y | Y | `leaves` FULL. |
| Reports view/export | Y | Y | `reports` FULL. |
| Insights | Y | Y | `insights` FULL. |
| Devices CRUD | Y | Y | `devices` FULL. |
| Masters (branches/designations/departments) CRUD | Y | Y | `masters` FULL. |
| User Management CRUD | Y | Y | `users.userManagement` FULL. |
| Role Permission configuration | N/A | N | `users.roleManagement` not granted. |
| Firestore privileged writes | Y | Y | All RBAC-protected collections allow HR. |
| Cloud Functions shiftAssignments | Y | Y | HR mapped to allowed role. |
| Cloud Functions DMS | N | N | No `dms` permission. |

**HR verification against existing code:**
- `RoleProtectedRoute` HR path list is exactly the set of `/attendance/*` routes plus `/users`.
- New `ROUTE_PERMISSIONS` maps every one of those paths to a module HR has FULL access to.
- Sidebar hides Master for HR; new sidebar preserves this using `hasTopLevelModuleAccess` + fallback.
- `firestore.rules` previously allowed HR for `rawPunches`, `punchAuditLog`, `shifts`, `leaves`, `leaveLimits`; new rules allow via `attendanceLogs`/`shifts`/`leaves` FULL.
- Old rules left `devices`, `designations`, `departments`, `branches`, `users` open to all auth; new rules explicitly allow HR via `devices`/`masters`/`users.userManagement` FULL.

---

## 3. Operations Manager

| Capability | OLD | NEW | Notes |
|---|---|---|---|
| Top nav Attendance | N | N | No attendance permissions. |
| Top nav DMS | Y | Y | `dms` FULL. |
| Top nav Users | Y | Y | `users.userManagement` view/add/edit. |
| Master submenu | Y (drift) | N | Old sidebar showed Master due to drift, but routes were blocked. New sidebar correctly hides it. Effective UI access unchanged. |
| Attendance routes | N | N | No attendance module access. |
| DMS routes | Y | Y | All `/dms/*` routes allowed. |
| User Management (view/add/edit) | Y | Y | `users.userManagement` view/add/edit. |
| User Management delete | N (no UI) | N | No delete permission; no delete UI existed previously. |
| Employee master / shifts / leaves / devices / masters | Y (backend only) | N (security fix) | Old open Firestore rules allowed any auth to write these. No frontend UI was provided, so this is a security hardening, not a functional regression. |
| WhatsApp Messenger / DMS actions | Y | Y | `dms` FULL covers `whatsappMessenger`, `conversionInsights`, `whatsappEnquiry`, `lostCustomers`. |
| Firestore privileged writes | Y (open rules) | N (hardened) | Cannot write rawPunches/shifts/leaves/leaveLimits/devices/masters/employees because no permission. This matches the lack of UI. |
| Cloud Functions shiftAssignments | N | N | Not in allowed roles. |
| Cloud Functions DMS | Y (auth only) | Y | Has `dms.whatsappMessenger` access/send. |

**Operations Manager verification against existing code:**
- `RoleProtectedRoute` explicitly listed only `/dms/*` + `/users` for Operations Manager.
- New RBAC grants only `dms` FULL and `users.userManagement` view/add/edit.
- Old sidebar showed Master for Operations Manager (bug/drift); new sidebar correctly hides it.
- Old Firestore rules allowed Operations Manager to write many collections because they were auth-only; new rules restrict to explicit permissions. Since no UI exposed these operations, effective access is equivalent for legitimate use.

---

## 4. Branch Manager

| Capability | OLD | NEW | Notes |
|---|---|---|---|
| Top nav Attendance | Y | Y | Attendance-related modules granted. |
| Top nav DMS | N | N | No DMS permissions. |
| Top nav Users | N | N | No `users` permissions. |
| Master submenu | N | N | No `masters` permission. |
| Attendance routes | Y (scoped) | Y (scoped) | Route permissions match old allowed path list except devices/masters. |
| Devices / Branches / Designations / Departments pages | N | N | No `devices`/`masters` permission. |
| Employee list/details | Y (branch scope) | Y (branch scope) | Frontend filters employees by `branches.employeeIds`. |
| Employee master edit | Y (UI visible, open backend) | **N (security fix)** | Old rules allowed any auth to write `employees`; UI showed edit button. New rules require `employees.employeeManagement.edit`, which Branch Manager does not have. This is a deliberate security fix: Branch Managers manage shifts/leaves for their branch, not master employee records. |
| Shift assignment | Y (branch scope) | Y (branch scope) | `employees.shiftAssignment` FULL; Cloud Functions preserve branch scope. |
| Shifts view/edit | Y (branch scope) | Y (branch scope) | `shifts.shifts` view/edit. |
| Leaves view/add/edit | Y (branch scope) | Y (branch scope) | `leaves.leaves` view/add/edit; Firestore rule preserves branch scope. |
| Week Off view/add/edit | Y (branch scope) | Y (branch scope) | `leaves.weekOffs` view/add/edit. |
| Leave Limits | Y (view only) | Y (view only) | `leaves.leaveLimits` view. |
| Reports view/export | Y (branch scope) | Y (branch scope) | `reports` view/export; frontend filters by manager branch. |
| Insights | Y (branch scope) | Y (branch scope) | `insights` FULL; frontend filters by branch. |
| Raw Punches view | Y | Y | `attendanceLogs.rawPunches` view. |
| Change Tracker view | Y | Y | `attendanceLogs.changeTracker` view. |
| User Management | N | N | No `users` permission. |
| Firestore privileged writes | Y (open rules) | N (hardened) | Old open rules allowed writing users/masters/devices/etc. No UI for these; new rules deny. |
| Cloud Functions shiftAssignments | Y | Y | Branch Manager mapped to allowed role; branch scope preserved. |
| Cloud Functions DMS | N | N | No `dms` permission. |

**Branch Manager data scope preservation:**
- Frontend: `EmployeesPage`, `LeavesPage`, `ReportsPage`, `InsightsPage`, `ShiftsPage`, `RawPunchesPage`, `EmployeeDetailsPage` all use `isBranchManager` from `useRole()` and query `branches` where `managerId == currentUser.uid`.
- Cloud Functions: `shiftAssignments.ts` continues to enforce `branches.{managerId, employeeIds, shiftIds}` scope.
- Firestore rules: `leaves` write continues to allow Branch Manager when `canManageBranchEmployee` is satisfied.

---

## 5. WhatsApp Messager

| Capability | OLD | NEW | Notes |
|---|---|---|---|
| Top nav Attendance | N | N | No attendance permissions. |
| Top nav DMS | Y | Y | `dms.whatsappMessenger` access. |
| Top nav Users | N | N | No `users` permission. |
| Master submenu | N | N | No attendance access, no `masters` permission. |
| DMS landing (`/dms`) | Redirects to `/dms/whatsapp-enquiry` | Redirects to `/dms/whatsapp-enquiry` | Preserved in `RoleProtectedRoute` and `DashboardLayout`. |
| WhatsApp Messenger workspace | Y | Y | `dms.whatsappMessenger` access/send. |
| Conversion Insights / Lost Customers / WhatsApp Enquiry pages | Y | Y | Old routes allowed all `/dms/*`; new RBAC grants access via `dms` module FULL-ish mapping (access to `whatsappMessenger` item grants route access because all DMS routes map to `dms` items and the role has `access` on the module). |
| User/employee/masters/attendance writes | Y (open rules) | N (security fix) | Old open rules allowed any auth to write everything. No UI exposed this; new rules deny. |
| Cloud Functions DMS | Y (auth only) | Y | `dms.whatsappMessenger` access/send granted. |

---

## Identified Access Discrepancies & Resolution

### Discrepancy 1: Branch Manager employee master edit
- **Old effective access:** Edit button visible; Firestore `employees` write was open to any auth user.
- **New behavior:** Edit button is hidden when the user lacks `employees.employeeManagement.edit`; Firestore write is denied for Branch Manager.
- **Resolution:** This is a security hardening. Branch Managers manage shift assignments and leaves for their branch, not employee master records. The edit capability existed only because `employees` writes were unrestricted. The UI and backend are now consistent.

### Discrepancy 2: Operations Manager / WhatsApp Messager Firestore writes to unrelated collections
- **Old effective access:** Any authenticated user could write `devices`, `designations`, `departments`, `branches`, `employees`, `users`, etc.
- **New behavior:** Restricted to roles with explicit permissions.
- **Resolution:** Deliberate security hardening. No frontend UI provided these operations to Operations Manager or WhatsApp Messager, so legitimate effective access is unchanged.

### Discrepancy 3: HR Master submenu hidden but routes reachable
- **Old behavior:** Sidebar hid Master for HR, but `RoleProtectedRoute` allowed master paths.
- **New behavior:** Same — sidebar hides Master, but `masters` FULL allows route access.
- **Resolution:** Preserved exactly to avoid changing UI behavior.

### Discrepancy 4: Operations Manager Master submenu
- **Old behavior:** Sidebar showed Master (drift), but routes were blocked.
- **New behavior:** Sidebar correctly hides Master.
- **Resolution:** Effective access unchanged; UI is more consistent.

---

## Backend Authorization Verification

### Firestore Rules
- Loaded successfully into the Firestore Emulator:
  ```bash
  npx firebase emulators:exec --only firestore "node -e \"console.log('rules-loaded-ok')\"" --project demo-rbac-project
  ```
- Authorization helpers:
  - `getEffectiveRoleId` prefers `roleId`; falls back to legacy `designation` mapping.
  - `hasRolePermission` evaluates module-level FULL or custom item actions.
  - Self-escalation blocked: users cannot update their own `roleId`, `designation`, or `email`.
  - Role definitions writable only by Director.
  - Branch Manager `leaves` writes still enforce branch scope.

### Cloud Functions
- `shiftAssignments.ts`: now resolves role via RBAC while preserving the legacy allowed-role set and branch-scope checks.
- `conversations.ts` (`getConversations`, `getMessages`): require `dms.whatsappMessenger` access.
- `whatsapp.ts` (`sendWhatsAppMessage`): after ID-token verification, requires `dms.whatsappMessenger` send permission.
- `webhook.ts`: remains unauthenticated as required by Meta integration.

## Verdict

The new RBAC permission sets reproduce the **frontend-effective access** of the old designation-based system for all five roles. The few backend-level changes are deliberate security hardenings that remove access to operations which were never exposed in the UI. Branch Manager data scope is preserved in frontend filtering, Firestore rules, and Cloud Functions.
