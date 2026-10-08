import { useMemo } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { hasModuleAccess, hasPermission } from './hasPermission';
import type { PermissionAction, UserPermissions } from './types';

export interface UsePermissionsResult {
  permissions: UserPermissions | null;
  hasPermission: (module: string, item: string, action: PermissionAction) => boolean;
  hasModuleAccess: (module: string) => boolean;
  isLoading: boolean;
}

export function usePermissions(): UsePermissionsResult {
  const { permissions, loading } = useAuthContext();

  return useMemo(() => ({
    permissions,
    hasPermission: (module: string, item: string, action: PermissionAction) =>
      hasPermission(permissions, module, item, action),
    hasModuleAccess: (module: string) => hasModuleAccess(permissions, module),
    isLoading: loading,
  }), [permissions, loading]);
}
