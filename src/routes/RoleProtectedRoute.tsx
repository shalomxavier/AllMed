import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { checkRoutePermission } from '@/permissions';
import { RedSpinner } from '@/components/common';

interface RoleProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Legacy designation-based authorization.
 * Kept only as a compatibility fallback until all users have been migrated
 * to the new RBAC system.
 */
const legacyRouteAllowed = (designation: string, path: string): { allowed: boolean; defaultPath: string } => {
  const hrAllowedPaths = [
    '/attendance',
    '/attendance/employees',
    '/attendance/employees/:id',
    '/attendance/records',
    '/attendance/shifts',
    '/attendance/leaves',
    '/attendance/devices',
    '/attendance/branches',
    '/attendance/designations',
    '/attendance/departments',
    '/attendance/reports',
    '/attendance/insights',
    '/attendance/change-tracker',
    '/attendance/reports/preview/monthly',
    '/attendance/reports/preview/daily',
    '/attendance/reports/preview/shifts',
    '/attendance/reports/preview/employee-master',
    '/users',
  ];

  const operationsManagerAllowedPaths = [
    '/dms',
    '/dms/workspace',
    '/dms/dashboard',
    '/dms/lost-customers',
    '/dms/whatsapp-enquiry',
    '/users',
  ];

  const whatsappMessagerAllowedPaths = [
    '/dms',
    '/dms/workspace',
    '/dms/dashboard',
    '/dms/lost-customers',
    '/dms/whatsapp-enquiry',
  ];

  const pathMatches = (allowedPaths: string[]): boolean =>
    allowedPaths.some((allowedPath) => {
      if (allowedPath.includes(':id')) {
        const regex = new RegExp(`^${allowedPath.replace(':id', '[^/]+')}$`);
        const basePath = allowedPath.replace('/:id', '');
        return regex.test(path) || path === basePath || path.startsWith(basePath + '/');
      }
      return path === allowedPath || path.startsWith(allowedPath + '/');
    });

  const restrictedMatches = (restrictedPaths: string[]): boolean =>
    restrictedPaths.some((restrictedPath) =>
      path === restrictedPath || path.startsWith(restrictedPath + '/')
    );

  let defaultPath = '/attendance';
  if (designation === 'Operations Manager' || designation === 'WhatsApp Messager') {
    defaultPath = '/dms';
  }

  switch (designation) {
    case 'HR':
      return { allowed: pathMatches(hrAllowedPaths), defaultPath };
    case 'Operations Manager':
      return { allowed: pathMatches(operationsManagerAllowedPaths), defaultPath };
    case 'WhatsApp Messager':
      return { allowed: pathMatches(whatsappMessagerAllowedPaths), defaultPath };
    case 'Branch Manager': {
      const branchManagerAllowedPaths = [
        '/attendance',
        '/attendance/employees',
        '/attendance/employees/:id',
        '/attendance/records',
        '/attendance/shifts',
        '/attendance/leaves',
        '/attendance/insights',
        '/attendance/reports',
        '/attendance/reports/preview/monthly',
        '/attendance/reports/preview/daily',
        '/attendance/reports/preview/shifts',
        '/attendance/reports/preview/employee-master',
      ];
      const restrictedPaths = [
        '/attendance/devices',
        '/attendance/branches',
        '/attendance/designations',
        '/attendance/departments',
      ];
      return {
        allowed: pathMatches(branchManagerAllowedPaths) && !restrictedMatches(restrictedPaths),
        defaultPath,
      };
    }
    case 'Director':
      return { allowed: true, defaultPath };
    default:
      // Unknown designations must not receive full access.
      return { allowed: false, defaultPath };
  }
};

export const RoleProtectedRoute: React.FC<RoleProtectedRouteProps> = ({ children }) => {
  const { currentUser, userData, permissions, loading } = useAuthContext();
  const location = useLocation();

  if (loading || !userData) {
    return (
      <div className="min-h-screen bg-secondary-50 flex items-center justify-center">
        <RedSpinner />
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const path = location.pathname;
  const designation = userData.designation;

  // Prefer the new RBAC system when a roleId (or derived legacy roleId) exists.
  // permissions is non-null when AuthContext successfully resolved a role document
  // or derived legacy permissions from designation.
  let allowed = false;
  let defaultPath = '/attendance';

  if (permissions) {
    allowed = checkRoutePermission(permissions, path);

    // Preserve redirect defaults for DMS-only roles.
    const roleName = userData.designation;
    if (roleName === 'Operations Manager' || roleName === 'WhatsApp Messager') {
      defaultPath = '/dms';
    }
  } else {
    // Fallback to legacy designation-based behavior during migration.
    const legacy = legacyRouteAllowed(designation, path);
    allowed = legacy.allowed;
    defaultPath = legacy.defaultPath;
  }

  if (!allowed) {
    return <Navigate to={defaultPath} replace />;
  }

  // Redirect WhatsApp Messager directly to WhatsApp Enquiry page.
  if (designation === 'WhatsApp Messager' && path === '/dms') {
    return <Navigate to="/dms/whatsapp-enquiry" replace />;
  }

  // Redirect WhatsApp Messager from DMS landing page as well.
  if (
    userData.roleId === 'whatsapp-messager' ||
    designation === 'WhatsApp Messager'
  ) {
    if (path === '/dms') {
      return <Navigate to="/dms/whatsapp-enquiry" replace />;
    }
  }

  return <>{children}</>;
};
