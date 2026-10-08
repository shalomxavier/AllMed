import * as functions from 'firebase-functions';
import { db } from './config';

const ROLE_IDS = {
  DIRECTOR: 'director',
  HR: 'hr',
  OPERATIONS_MANAGER: 'operations-manager',
  BRANCH_MANAGER: 'branch-manager',
  WHATSAPP_MESSAGER: 'whatsapp-messager',
} as const;

type PermissionAction = 'view' | 'access' | 'add' | 'edit' | 'delete' | 'export' | 'send' | 'manage';

type ModulePermissions = {
  accessMode?: string;
  items?: Record<string, { actions?: PermissionAction[] }>;
};

type UserPermissions = Record<string, ModulePermissions>;

function normalizeAction(action: PermissionAction): 'view' | PermissionAction {
  return action === 'access' ? 'view' : action;
}

function getRoleIdFromDesignation(designation?: string): string {
  if (!designation) return '';
  switch (designation.trim()) {
    case 'Director':
      return ROLE_IDS.DIRECTOR;
    case 'HR':
      return ROLE_IDS.HR;
    case 'Operations Manager':
      return ROLE_IDS.OPERATIONS_MANAGER;
    case 'Branch Manager':
      return ROLE_IDS.BRANCH_MANAGER;
    case 'WhatsApp Messager':
      return ROLE_IDS.WHATSAPP_MESSAGER;
    default:
      return '';
  }
}

/**
 * Role/designation is retained for administrative identity and branch scoping
 * only. It never contributes module permissions.
 */
export async function getEffectiveRoleId(uid: string): Promise<string> {
  const snapshot = await db.collection('users').doc(uid).get();
  const data = snapshot.data();
  if (!data) return '';
  if (data.roleId && typeof data.roleId === 'string') {
    return data.roleId;
  }
  return getRoleIdFromDesignation(data.designation);
}

/**
 * Authorization is resolved solely from the caller's own permission tree
 * stored at users/{uid}.permissions.
 */
export async function getUserPermissions(uid: string): Promise<UserPermissions> {
  const snapshot = await db.collection('users').doc(uid).get();
  const data = snapshot.data();
  if (!data || !data.permissions || typeof data.permissions !== 'object') return {};
  return data.permissions as UserPermissions;
}

export function evaluateUserPermission(
  permissions: UserPermissions | null | undefined,
  module: string,
  item: string,
  action: PermissionAction
): boolean {
  if (!permissions) return false;
  const modulePerms = permissions[module];
  if (!modulePerms) return false;
  if (modulePerms.accessMode === 'full') return true;
  const itemPerms = modulePerms.items?.[item];
  if (!itemPerms || !Array.isArray(itemPerms.actions)) return false;
  const target = normalizeAction(action);
  return itemPerms.actions.some((a) => normalizeAction(a) === target);
}

export async function hasUserPermission(
  uid: string,
  module: string,
  item: string,
  action: PermissionAction
): Promise<boolean> {
  const permissions = await getUserPermissions(uid);
  return evaluateUserPermission(permissions, module, item, action);
}

export async function isDirector(uid: string): Promise<boolean> {
  return (await getEffectiveRoleId(uid)) === ROLE_IDS.DIRECTOR;
}

export async function isBranchManager(uid: string): Promise<boolean> {
  return (await getEffectiveRoleId(uid)) === ROLE_IDS.BRANCH_MANAGER;
}

export function requireAuth(context: functions.https.CallableContext | undefined): string {
  if (!context?.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  return context.auth.uid;
}

export async function requirePermission(
  context: functions.https.CallableContext | undefined,
  module: string,
  item: string,
  action: PermissionAction,
  errorMessage?: string
): Promise<string> {
  const uid = requireAuth(context);
  const allowed = await hasUserPermission(uid, module, item, action);
  if (!allowed) {
    throw new functions.https.HttpsError(
      'permission-denied',
      errorMessage || `You do not have permission to ${action} ${item}.`
    );
  }
  return uid;
}
