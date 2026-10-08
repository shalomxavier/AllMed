import { PERMISSION_MODULES } from './definitions';
import type { PermissionAction, UserPermissions } from './types';

export type ModuleCheckState = 'none' | 'partial' | 'full';

/**
 * Determine the visual module checkbox state from the stored user permissions.
 *
 * - 'full'  => the module has accessMode "full" (all current and future items/actions).
 * - 'partial' => the module has accessMode "custom" with at least one action granted.
 * - 'none'  => the module is absent or has no effective permissions.
 */
export function getModuleState(
  permissions: UserPermissions | null | undefined,
  moduleKey: string
): ModuleCheckState {
  if (!permissions) return 'none';
  const modulePerms = permissions[moduleKey];
  if (!modulePerms) return 'none';
  if (modulePerms.accessMode === 'full') return 'full';
  const items = modulePerms.items ?? {};
  const hasAny = Object.values(items).some(
    (item) => item && Array.isArray(item.actions) && item.actions.length > 0
  );
  return hasAny ? 'partial' : 'none';
}

/**
 * Whether a specific action checkbox should be checked in the editor.
 * A module with accessMode "full" checks every defined action (and grants future ones).
 */
export function isActionChecked(
  permissions: UserPermissions | null | undefined,
  moduleKey: string,
  itemKey: string,
  action: PermissionAction
): boolean {
  const state = getModuleState(permissions, moduleKey);
  if (state === 'full') return true;
  if (state === 'none') return false;
  return permissions![moduleKey]?.items?.[itemKey]?.actions.includes(action) ?? false;
}

/**
 * Toggle the whole module between "full" and "none".
 * - none / partial => full (all current and future items/actions).
 * - full => remove the module entirely, clearing all child actions.
 */
export function toggleModule(
  permissions: UserPermissions | null | undefined,
  moduleKey: string
): UserPermissions {
  const current = getModuleState(permissions, moduleKey);
  const next: UserPermissions = { ...(permissions ?? {}) };
  if (current === 'none') {
    next[moduleKey] = { accessMode: 'full' };
  } else {
    // Unchecking a module clears every child action.
    delete next[moduleKey];
  }
  return next;
}

/**
 * Toggle a single action checkbox, keeping the parent module in sync.
 *
 * - If the module is currently full, unchecking an action converts it to a
 *   custom state where every other defined action remains checked.
 * - If the module is partial, checking an action adds it; unchecking removes it
 *   and, if it was the last action, removes the whole module.
 * - If the module has no access, checking an action creates a custom module
 *   containing just that action.
 *
 * The data model never stores a "module access" flag independent of its
 * children: module access is always derived from accessMode "full" or the
 * aggregate of custom action grants.
 */
export function toggleAction(
  permissions: UserPermissions | null | undefined,
  moduleKey: string,
  itemKey: string,
  action: PermissionAction
): UserPermissions {
  const currentlyChecked = isActionChecked(permissions, moduleKey, itemKey, action);
  const next: UserPermissions = { ...(permissions ?? {}) };

  if (currentlyChecked) {
    // Uncheck the action.
    const modulePerms = next[moduleKey];
    if (modulePerms?.accessMode === 'full') {
      // Convert full -> custom, preserving all defined actions except the one
      // being unchecked. The resulting state is Custom, not Full Access.
      const moduleDef = PERMISSION_MODULES.find((m) => m.key === moduleKey);
      const items: Record<string, { actions: PermissionAction[] }> = {};
      if (moduleDef) {
        for (const item of moduleDef.items) {
          const actions = item.actions.filter(
            (a) => !(item.key === itemKey && a === action)
          );
          if (actions.length > 0) {
            items[item.key] = { actions };
          }
        }
      }
      next[moduleKey] = { accessMode: 'custom', items };
    } else if (modulePerms?.accessMode === 'custom') {
      const items = { ...(modulePerms.items ?? {}) };
      const itemPerms = items[itemKey];
      if (itemPerms) {
        const newActions = itemPerms.actions.filter((a) => a !== action);
        if (newActions.length > 0) {
          items[itemKey] = { actions: newActions };
        } else {
          delete items[itemKey];
        }
      }
      if (Object.keys(items).length > 0) {
        next[moduleKey] = { accessMode: 'custom', items };
      } else {
        delete next[moduleKey];
      }
    }
  } else {
    // Check the action.
    const modulePerms = next[moduleKey];
    const items = { ...(modulePerms?.items ?? {}) };
    const itemPerms = items[itemKey] ?? { actions: [] };
    if (!itemPerms.actions.includes(action)) {
      items[itemKey] = { actions: [...itemPerms.actions, action] };
    }
    next[moduleKey] = { accessMode: 'custom', items };
  }

  return next;
}

/** Grant every module full access. */
export function setAllFull(): UserPermissions {
  const next: UserPermissions = {};
  for (const module of PERMISSION_MODULES) {
    next[module.key] = { accessMode: 'full' };
  }
  return next;
}

/** Remove all permissions. */
export function clearAll(): UserPermissions {
  return {};
}
