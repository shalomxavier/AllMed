import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  PERMISSION_MODULES,
  clearAll,
  getModuleState,
  isActionChecked,
  permissionsEqual,
  setAllFull,
  toggleAction,
  toggleModule,
  type PermissionAction,
  type UserPermissions,
} from '@/permissions';

interface PermissionEditorProps {
  value: UserPermissions;
  onChange: (value: UserPermissions) => void;
  readOnly?: boolean;
  /** Default template for the currently selected role (undefined = no role). */
  defaults?: UserPermissions;
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

const moduleStateLabels = {
  none: 'No Access',
  partial: 'Custom',
  full: 'Full Access',
} as const;

export const PermissionEditor: React.FC<PermissionEditorProps> = ({
  value,
  onChange,
  readOnly = false,
  defaults,
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmingReset, setConfirmingReset] = useState(false);

  const hasDefaults = defaults !== undefined;
  const resetDisabled = !hasDefaults;
  const matchesDefaults = hasDefaults && permissionsEqual(value, defaults);

  const handleResetDefaults = () => {
    if (resetDisabled) return;
    // A no-op when the selection already matches the template; otherwise a
    // second click confirms replacing a customized selection.
    if (matchesDefaults) return;
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setConfirmingReset(false);
    onChange(structuredClone(defaults));
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div>
          <h4 className="text-sm font-semibold text-secondary-900">Permissions</h4>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onChange(setAllFull())}
              className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700 transition-colors"
            >
              Grant All
            </button>
            <button
              type="button"
              onClick={() => onChange(clearAll())}
              className="px-3 py-1.5 text-xs font-medium text-secondary-700 bg-secondary-100 rounded hover:bg-secondary-200 transition-colors"
            >
              Revoke All
            </button>
            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={resetDisabled}
              title={resetDisabled ? 'Select a role to apply its default permissions' : undefined}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                resetDisabled
                  ? 'text-secondary-400 bg-secondary-50 cursor-not-allowed'
                  : confirmingReset
                    ? 'text-white bg-amber-600 hover:bg-amber-700'
                    : 'text-secondary-700 bg-secondary-100 hover:bg-secondary-200'
              }`}
            >
              {confirmingReset ? 'Confirm Reset?' : 'Reset'}
            </button>
            {confirmingReset && (
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="px-2 py-1.5 text-xs text-secondary-500 hover:text-secondary-700 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {PERMISSION_MODULES.map((module) => {
          const state = getModuleState(value, module.key);
          return (
            <div key={module.key} className="border border-secondary-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setExpanded((previous) => ({
                      ...previous,
                      [module.key]: !previous[module.key],
                    }))}
                    className="p-0.5 rounded hover:bg-secondary-100 transition-colors"
                    aria-label={`${expanded[module.key] ? 'Collapse' : 'Expand'} ${module.label}`}
                  >
                    {expanded[module.key]
                      ? <ChevronDown size={16} className="text-secondary-500" />
                      : <ChevronRight size={16} className="text-secondary-500" />}
                  </button>
                  <div>
                    <h5 className="text-sm font-semibold text-secondary-900 leading-tight">
                      {module.label}
                    </h5>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-secondary-700 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    ref={(element) => {
                      if (element) element.indeterminate = state === 'partial';
                    }}
                    checked={state === 'full'}
                    onChange={() => !readOnly && onChange(toggleModule(value, module.key))}
                    disabled={readOnly}
                    className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                    aria-label={`${module.label} access`}
                  />
                  {moduleStateLabels[state]}
                </label>
              </div>

              {expanded[module.key] && (
                <div className="space-y-2 mt-2">
                  {module.items.map((item) => (
                    <div key={item.key} className="pl-2 border-l-2 border-secondary-100">
                      <p className="text-xs font-medium text-secondary-700 mb-1">{item.label}</p>
                      <div className="flex flex-wrap gap-3">
                        {item.actions.map((action) => (
                          <label
                            key={action}
                            className={`flex items-center gap-1.5 text-xs ${
                              readOnly ? 'cursor-default text-secondary-500' : 'cursor-pointer text-secondary-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isActionChecked(value, module.key, item.key, action)}
                              onChange={() => !readOnly && onChange(toggleAction(value, module.key, item.key, action))}
                              disabled={readOnly}
                              className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span>{actionLabels[action]}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
