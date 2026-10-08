import { useMemo } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { hasModuleAccess, hasPermission } from './hasPermission';
import type { PermissionAction, Role, RolePermissions } from './types';

export interface UsePermissionsResult {
  permissions: RolePermissions | null;
  role: Role | null;
  hasPermission: (module: string, item: string, action: PermissionAction) => boolean;
  hasModuleAccess: (module: string) => boolean;
  isLoading: boolean;
}

export function usePermissions(): UsePermissionsResult {
  const { role, permissions, loading } = useAuthContext();

  return useMemo(() => {
    return {
      permissions,
      role,
      hasPermission: (module: string, item: string, action: PermissionAction) =>
        hasPermission(permissions, module, item, action),
      hasModuleAccess: (module: string) => hasModuleAccess(permissions, module),
      isLoading: loading,
    };
  }, [role, permissions, loading]);
}
