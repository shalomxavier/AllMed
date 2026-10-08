export type PermissionAction =
  | 'view'
  | 'access'
  | 'add'
  | 'edit'
  | 'delete'
  | 'export'
  | 'send'
  | 'manage';

export type AccessMode = 'full' | 'custom';

export interface PermissionItem {
  actions: PermissionAction[];
}

export interface ModulePermissions {
  accessMode: AccessMode;
  items?: Record<string, PermissionItem>;
}

export interface RolePermissions {
  [module: string]: ModulePermissions | undefined;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  isFixed: boolean;
  permissions: RolePermissions;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserRoleData {
  id: string;
  name: string;
  email: string;
  designation: string;
  branch: string;
  roleId?: string;
}
