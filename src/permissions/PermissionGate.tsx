import { usePermissions } from './usePermissions';
import type { PermissionAction } from './types';

interface PermissionGateProps {
  module: string;
  item: string;
  action: PermissionAction;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  module,
  item,
  action,
  children,
  fallback = null,
}) => {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) return null;

  return hasPermission(module, item, action) ? <>{children}</> : <>{fallback}</>;
};
