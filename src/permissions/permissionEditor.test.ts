import { describe, expect, it } from 'vitest';
import { EXAMPLE_USER_PERMISSIONS } from './testFixtures';
import {
  getModuleState,
  isActionChecked,
  toggleModule,
  toggleAction,
  setAllFull,
  clearAll,
} from './permissionEditor';
import type { PermissionAction, UserPermissions } from './types';

describe('getModuleState', () => {
  it('returns none when the module is absent', () => {
    expect(getModuleState({}, 'employees')).toBe('none');
  });

  it('returns none when permissions are null', () => {
    expect(getModuleState(null, 'employees')).toBe('none');
  });

  it('returns full when accessMode is full', () => {
    expect(getModuleState({ employees: { accessMode: 'full' } }, 'employees')).toBe('full');
  });

  it('returns partial when at least one action is granted', () => {
    const perms: UserPermissions = {
      employees: { accessMode: 'custom', items: { employeeManagement: { actions: ['view'] } } },
    };
    expect(getModuleState(perms, 'employees')).toBe('partial');
  });

  it('returns none for a custom module with no actions', () => {
    expect(getModuleState({ employees: { accessMode: 'custom', items: {} } }, 'employees')).toBe('none');
  });
});

describe('isActionChecked', () => {
  it('checks every defined action when the module is full', () => {
    const perms: UserPermissions = { employees: { accessMode: 'full' } };
    expect(isActionChecked(perms, 'employees', 'employeeManagement', 'view')).toBe(true);
    expect(isActionChecked(perms, 'employees', 'employeeManagement', 'delete')).toBe(true);
    expect(isActionChecked(perms, 'employees', 'futureItem', 'edit' as PermissionAction)).toBe(true);
  });

  it('reflects only granted custom actions', () => {
    const perms: UserPermissions = {
      employees: {
        accessMode: 'custom',
        items: { employeeManagement: { actions: ['view', 'add'] } },
      },
    };
    expect(isActionChecked(perms, 'employees', 'employeeManagement', 'view')).toBe(true);
    expect(isActionChecked(perms, 'employees', 'employeeManagement', 'add')).toBe(true);
    expect(isActionChecked(perms, 'employees', 'employeeManagement', 'delete')).toBe(false);
    expect(isActionChecked(perms, 'employees', 'shiftAssignment', 'view')).toBe(false);
  });

  it('returns false when the module has no access', () => {
    expect(isActionChecked({}, 'employees', 'employeeManagement', 'view')).toBe(false);
  });
});

describe('toggleAction syncs the parent module state', () => {
  it('checking an action automatically enables the parent module as custom', () => {
    let perms = toggleAction({}, 'employees', 'employeeManagement', 'view');
    expect(getModuleState(perms, 'employees')).toBe('partial');
    expect(perms.employees?.accessMode).toBe('custom');
    expect(isActionChecked(perms, 'employees', 'employeeManagement', 'view')).toBe(true);
  });

  it('unchecking the only action removes the parent module', () => {
    let perms = toggleAction({}, 'employees', 'employeeManagement', 'view');
    perms = toggleAction(perms, 'employees', 'employeeManagement', 'view');
    expect(getModuleState(perms, 'employees')).toBe('none');
    expect(perms.employees).toBeUndefined();
  });

  it('unchecking one action preserves the parent module when other actions remain', () => {
    let perms = toggleAction({}, 'employees', 'employeeManagement', 'view');
    perms = toggleAction(perms, 'employees', 'employeeManagement', 'add');
    expect(getModuleState(perms, 'employees')).toBe('partial');

    perms = toggleAction(perms, 'employees', 'employeeManagement', 'view');
    expect(getModuleState(perms, 'employees')).toBe('partial');
    expect(isActionChecked(perms, 'employees', 'employeeManagement', 'add')).toBe(true);
    expect(isActionChecked(perms, 'employees', 'employeeManagement', 'view')).toBe(false);
  });

  it('unchecking the last remaining action removes the parent module', () => {
    let perms = toggleAction({}, 'employees', 'employeeManagement', 'view');
    perms = toggleAction(perms, 'employees', 'employeeManagement', 'view');
    expect(getModuleState(perms, 'employees')).toBe('none');
    expect(perms.employees).toBeUndefined();
  });
});

describe('toggleAction from full access', () => {
  it('unchecking an action under full access converts the module to custom with all other actions checked', () => {
    const perms: UserPermissions = { employees: { accessMode: 'full' } };
    const next = toggleAction(perms, 'employees', 'employeeManagement', 'delete');

    expect(getModuleState(next, 'employees')).toBe('partial');
    expect(next.employees?.accessMode).toBe('custom');

    // Unchecked action stays unchecked.
    expect(isActionChecked(next, 'employees', 'employeeManagement', 'delete')).toBe(false);

    // Every other defined action in the module stays checked.
    expect(isActionChecked(next, 'employees', 'employeeManagement', 'view')).toBe(true);
    expect(isActionChecked(next, 'employees', 'employeeManagement', 'add')).toBe(true);
    expect(isActionChecked(next, 'employees', 'employeeManagement', 'edit')).toBe(true);
    expect(isActionChecked(next, 'employees', 'shiftAssignment', 'view')).toBe(true);
    expect(isActionChecked(next, 'employees', 'shiftAssignment', 'delete')).toBe(true);
  });

  it('does not restore full access when an action is re-checked after being unchecked from full', () => {
    let perms: UserPermissions = { employees: { accessMode: 'full' } };
    perms = toggleAction(perms, 'employees', 'employeeManagement', 'delete');
    perms = toggleAction(perms, 'employees', 'employeeManagement', 'delete');

    expect(getModuleState(perms, 'employees')).toBe('partial');
    expect(perms.employees?.accessMode).toBe('custom');
    expect(isActionChecked(perms, 'employees', 'employeeManagement', 'delete')).toBe(true);
  });

  it('keeps custom state when every current action is checked manually', () => {
    // Start with all actions in employeeManagement except view already checked.
    let perms: UserPermissions = {
      employees: {
        accessMode: 'custom',
        items: {
          employeeManagement: { actions: ['add', 'edit', 'delete'] },
          shiftAssignment: { actions: ['view', 'add', 'edit', 'delete'] },
        },
      },
    };
    perms = toggleAction(perms, 'employees', 'employeeManagement', 'view');

    expect(getModuleState(perms, 'employees')).toBe('partial');
    expect(perms.employees?.accessMode).toBe('custom');
    expect(isActionChecked(perms, 'employees', 'employeeManagement', 'view')).toBe(true);
  });
});

describe('toggleModule', () => {
  it('toggles from none to full access', () => {
    const perms = toggleModule({}, 'employees');
    expect(getModuleState(perms, 'employees')).toBe('full');
    expect(perms.employees).toEqual({ accessMode: 'full' });
  });

  it('unchecking a full module removes it (clears all child actions)', () => {
    let perms = toggleModule({}, 'employees');
    perms = toggleModule(perms, 'employees');
    expect(getModuleState(perms, 'employees')).toBe('none');
    expect(perms.employees).toBeUndefined();
  });

  it('unchecking a partial module removes it (clears all child actions)', () => {
    let perms = toggleAction({}, 'employees', 'employeeManagement', 'view');
    expect(getModuleState(perms, 'employees')).toBe('partial');
    perms = toggleModule(perms, 'employees');
    expect(getModuleState(perms, 'employees')).toBe('none');
    expect(perms.employees).toBeUndefined();
  });
});

describe('bulk helpers', () => {
  it('setAllFull grants full access to every module', () => {
    const perms = setAllFull();
    for (const module of Object.keys(perms)) {
      expect(getModuleState(perms, module)).toBe('full');
    }
  });

  it('clearAll removes every module', () => {
    const perms = clearAll();
    expect(Object.keys(perms)).toHaveLength(0);
  });
});

describe('example permission sets', () => {
  it('a full-access user renders every module as full', () => {
    const perms = EXAMPLE_USER_PERMISSIONS.director;
    expect(getModuleState(perms, 'employees')).toBe('full');
    expect(getModuleState(perms, 'dms')).toBe('full');
  });

  it('a custom user shows the expected partial and full modules', () => {
    const perms = EXAMPLE_USER_PERMISSIONS['branch-manager'];
    expect(getModuleState(perms, 'employees')).toBe('partial');
    expect(getModuleState(perms, 'insights')).toBe('full');
    expect(getModuleState(perms, 'devices')).toBe('none');
    expect(isActionChecked(perms, 'employees', 'shiftAssignment', 'delete')).toBe(true);
    expect(isActionChecked(perms, 'employees', 'employeeManagement', 'delete')).toBe(false);
  });
});
