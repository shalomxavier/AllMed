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

export async function getEffectiveRoleId(uid: string): Promise<string> {
  const snapshot = await db.collection('users').doc(uid).get();
  const data = snapshot.data();
  if (!data) return '';
  if (data.roleId && typeof data.roleId === 'string') {
    return data.roleId;
  }
  return getRoleIdFromDesignation(data.designation);
}

export async function getRolePermissions(uid: string): Promise<Record<string, unknown>> {
  const roleId = await getEffectiveRoleId(uid);
  if (!roleId) return {};
  const snapshot = await db.collection('roles').doc(roleId).get();
  const data = snapshot.data();
  return (data?.permissions as Record<string, unknown>) || {};
}

export async function hasRolePermission(
  uid: string,
  module: string,
  item: string,
  action: PermissionAction
): Promise<boolean> {
  const roleId = await getEffectiveRoleId(uid);
  if (!roleId) return false;

  const roleSnapshot = await db.collection('roles').doc(roleId).get();
  const roleData = roleSnapshot.data();
  if (!roleData || !roleData.permissions) return false;

  const permissions = roleData.permissions as Record<string, { accessMode?: string; items?: Record<string, { actions: PermissionAction[] }> }>;
  const modulePerms = permissions[module];
  if (!modulePerms) return false;

  if (modulePerms.accessMode === 'full') return true;

  const itemPerms = modulePerms.items?.[item];
  if (!itemPerms || !itemPerms.actions) return false;

  const target = normalizeAction(action);
  return itemPerms.actions.some((a) => normalizeAction(a) === target);
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
  const allowed = await hasRolePermission(uid, module, item, action);
  if (!allowed) {
    throw new functions.https.HttpsError(
      'permission-denied',
      errorMessage || `You do not have permission to ${action} ${item}.`
    );
  }
  return uid;
}
