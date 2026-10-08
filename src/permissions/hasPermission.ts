import type { PermissionAction, RolePermissions } from './types';

export type NormalizedAction = Exclude<PermissionAction, 'access'> | 'view';

function normalizeAction(action: PermissionAction): NormalizedAction {
  return action === 'access' ? 'view' : action;
}

/**
 * Check whether a role's permissions grant a specific action on a permission item.
 *
 * Rules:
 * - If the module is missing or the role has no permissions, return false.
 * - If the module accessMode is 'full', all actions on all items in that module are granted,
 *   including future permission items.
 * - If the module accessMode is 'custom', only explicitly listed items/actions are granted.
 * - 'access' is treated as equivalent to 'view' for permission checking.
 */
export function hasPermission(
  rolePermissions: RolePermissions | null | undefined,
  module: string,
  item: string,
  action: PermissionAction
): boolean {
  if (!rolePermissions) return false;

  const modulePermissions = rolePermissions[module];
  if (!modulePermissions) return false;

  const targetAction = normalizeAction(action);

  if (modulePermissions.accessMode === 'full') {
    return true;
  }

  const itemPermissions = modulePermissions.items?.[item];
  if (!itemPermissions) return false;

  return itemPermissions.actions.some((a) => normalizeAction(a) === targetAction);
}

/**
 * Check whether a role has any permission under a module (useful for sidebar/route visibility).
 */
export function hasModuleAccess(
  rolePermissions: RolePermissions | null | undefined,
  module: string
): boolean {
  if (!rolePermissions) return false;
  const modulePermissions = rolePermissions[module];
  if (!modulePermissions) return false;
  return modulePermissions.accessMode === 'full' || Object.keys(modulePermissions.items ?? {}).length > 0;
}
