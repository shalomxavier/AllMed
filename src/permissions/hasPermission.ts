import type { PermissionAction, UserPermissions } from './types';

export type NormalizedAction = Exclude<PermissionAction, 'access'> | 'view';

export function normalizeAction(action: PermissionAction): NormalizedAction {
  return action === 'access' ? 'view' : action;
}

export function hasPermission(
  permissions: UserPermissions | null | undefined,
  module: string,
  item: string,
  action: PermissionAction
): boolean {
  if (!permissions) return false;

  const modulePermissions = permissions[module];
  if (!modulePermissions) return false;

  if (modulePermissions.accessMode === 'full') return true;

  const itemPermissions = modulePermissions.items?.[item];
  if (!itemPermissions) return false;

  const targetAction = normalizeAction(action);
  return itemPermissions.actions.some((candidate) => normalizeAction(candidate) === targetAction);
}

export function hasModuleAccess(
  permissions: UserPermissions | null | undefined,
  module: string
): boolean {
  if (!permissions) return false;
  const modulePermissions = permissions[module];
  if (!modulePermissions) return false;
  return modulePermissions.accessMode === 'full' || Object.values(modulePermissions.items ?? {}).some(
    (item) => item.actions.length > 0
  );
}
