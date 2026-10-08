import { useMemo } from 'react';
import {
  PERMISSION_MODULES,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_NAMES,
  type PermissionAction,
  type RolePermissions,
} from '@/permissions';

interface PermissionEditorProps {
  roleId: string | null;
  roleName?: string;
  value: RolePermissions | null;
  onChange: (value: RolePermissions) => void;
  readOnly?: boolean;
}

const actionLabels: Record<PermissionAction, string> = {
  view: 'View',
  access: 'Access',
  add: 'Add',
  edit: 'Edit',
  delete: 'Delete',
  export: 'Export',
  send: 'Send',
  manage: 'Manage',
};

export const PermissionEditor: React.FC<PermissionEditorProps> = ({
  roleId,
  roleName,
  value,
  onChange,
  readOnly = false,
}) => {
  const effectiveValue = useMemo(() => {
    if (value) return value;
    if (roleId && DEFAULT_ROLE_PERMISSIONS[roleId]) return DEFAULT_ROLE_PERMISSIONS[roleId];
    return {};
  }, [value, roleId]);

  const toggleFullAccess = (moduleKey: string) => {
    if (readOnly) return;
    const next: RolePermissions = { ...effectiveValue };
    const current = next[moduleKey];
    if (!current || current.accessMode !== 'full') {
      next[moduleKey] = { accessMode: 'full' };
    } else {
      next[moduleKey] = { accessMode: 'custom', items: {} };
    }
    onChange(next);
  };

  const toggleAction = (moduleKey: string, itemKey: string, action: PermissionAction) => {
    if (readOnly) return;
    const next: RolePermissions = { ...effectiveValue };
    const modulePerms = next[moduleKey] || { accessMode: 'custom', items: {} };
    if (modulePerms.accessMode === 'full') {
      // Convert full to custom preserving currently defined items.
      modulePerms.accessMode = 'custom';
      modulePerms.items = {};
    }
    const items = modulePerms.items || {};
    const itemPerms = items[itemKey] || { actions: [] };
    const hasAction = itemPerms.actions.includes(action);
    const actions = hasAction
      ? itemPerms.actions.filter((a) => a !== action)
      : [...itemPerms.actions, action];
    items[itemKey] = { actions };
    modulePerms.items = items;
    next[moduleKey] = modulePerms;
    onChange(next);
  };

  const grantAll = () => {
    if (readOnly) return;
    const next: RolePermissions = {};
    PERMISSION_MODULES.forEach((module) => {
      next[module.key] = { accessMode: 'full' };
    });
    onChange(next);
  };

  const revokeAll = () => {
    if (readOnly) return;
    onChange({});
  };

  const displayRoleName = roleName || (roleId ? ROLE_NAMES[roleId] : 'Selected Role');

  return (
    <div className="space-y-4">
      <div className="bg-secondary-50 p-3 rounded-lg border border-secondary-200">
        <h4 className="text-sm font-semibold text-secondary-900">Role Permissions</h4>
        <p className="text-xs text-secondary-600 mt-1">
          Permissions are managed at the role level and apply to all users assigned to this role.
          {displayRoleName ? ` Currently editing: ${displayRoleName}` : ''}
        </p>
      </div>

      {!readOnly && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={grantAll}
            className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700 transition-colors"
          >
            Grant All
          </button>
          <button
            type="button"
            onClick={revokeAll}
            className="px-3 py-1.5 text-xs font-medium text-secondary-700 bg-secondary-100 rounded hover:bg-secondary-200 transition-colors"
          >
            Revoke All
          </button>
        </div>
      )}

      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {PERMISSION_MODULES.map((module) => {
          const modulePerms = effectiveValue[module.key];
          const isFull = modulePerms?.accessMode === 'full';
          return (
            <div key={module.key} className="border border-secondary-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-sm font-semibold text-secondary-900">{module.label}</h5>
                <label className="flex items-center gap-2 text-xs text-secondary-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFull}
                    onChange={() => toggleFullAccess(module.key)}
                    disabled={readOnly}
                    className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                  />
                  Full Access
                </label>
              </div>

              <div className="space-y-2">
                {module.items.map((item) => {
                  const itemPerms = isFull
                    ? { actions: item.actions }
                    : modulePerms?.items?.[item.key] || { actions: [] };
                  return (
                    <div key={item.key} className="pl-2 border-l-2 border-secondary-100">
                      <p className="text-xs font-medium text-secondary-700 mb-1">{item.label}</p>
                      <div className="flex flex-wrap gap-3">
                        {item.actions.map((action) => (
                          <label
                            key={action}
                            className={`flex items-center gap-1.5 text-xs ${readOnly ? 'cursor-default text-secondary-500' : 'cursor-pointer text-secondary-700'}`}
                          >
                            <input
                              type="checkbox"
                              checked={isFull || itemPerms.actions.includes(action)}
                              onChange={() => toggleAction(module.key, item.key, action)}
                              disabled={readOnly || isFull}
                              className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                            />
                            {actionLabels[action] || action}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
