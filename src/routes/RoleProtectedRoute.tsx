import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { PageSkeleton } from '@/components/common';

interface RoleProtectedRouteProps {
  children: React.ReactNode;
}

export const RoleProtectedRoute: React.FC<RoleProtectedRouteProps> = ({ children }) => {
  const { currentUser, userData, loading } = useAuthContext();
  const location = useLocation();

  if (loading || !userData) {
    return (
      <div className="min-h-screen bg-secondary-50 p-4 lg:p-6">
        <PageSkeleton />
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const designation = userData.designation;
  const path = location.pathname;

  // Define specific allowed paths for each role
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
    '/attendance/reports/preview/monthly',
    '/attendance/reports/preview/daily',
    '/attendance/reports/preview/shifts',
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

  let allowed = false;
  if (designation === 'HR') {
    // HR can access attendance (including master routes) and users
    allowed = hrAllowedPaths.some(allowedPath => {
      if (allowedPath.includes(':id')) {
        // Handle dynamic routes
        const regex = new RegExp(allowedPath.replace(':id', '[^/]+'));
        return regex.test(path);
      }
      return path === allowedPath || path.startsWith(allowedPath + '/');
    });
  } else if (designation === 'Operations Manager') {
    // Operations Manager can access DMS and users
    allowed = operationsManagerAllowedPaths.some(allowedPath => {
      return path === allowedPath || path.startsWith(allowedPath + '/');
    });
  } else if (designation === 'WhatsApp Messager') {
    // WhatsApp Messager can only access DMS
    allowed = whatsappMessagerAllowedPaths.some(allowedPath => {
      return path === allowedPath || path.startsWith(allowedPath + '/');
    });
  } else if (designation === 'Branch Manager') {
    // Branch Manager can only access specific attendance routes (employees, records, shifts, leaves, insights, reports)
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
    ];
    // Also explicitly restrict devices, branches, designations, and departments
    const restrictedPaths = [
      '/attendance/devices',
      '/attendance/branches',
      '/attendance/designations',
      '/attendance/departments',
    ];
    
    const isAllowed = branchManagerAllowedPaths.some(allowedPath => {
      if (allowedPath.includes(':id')) {
        // Handle dynamic routes
        const regex = new RegExp(allowedPath.replace(':id', '[^/]+'));
        return regex.test(path);
      }
      return path === allowedPath || path.startsWith(allowedPath + '/');
    });
    
    const isRestricted = restrictedPaths.some(restrictedPath => {
      return path === restrictedPath || path.startsWith(restrictedPath + '/');
    });
    
    allowed = isAllowed && !isRestricted;
  } else {
    // Other roles (like Admin) have full access
    allowed = true;
  }

  if (!allowed) {
    let defaultPath = '/attendance';
    if (designation === 'Operations Manager' || designation === 'WhatsApp Messager') {
      defaultPath = '/dms';
    }
    return <Navigate to={defaultPath} replace />;
  }

  // Redirect WhatsApp Messager directly to WhatsApp Enquiry page
  if (designation === 'WhatsApp Messager' && path === '/dms') {
    return <Navigate to="/dms/whatsapp-enquiry" replace />;
  }

  return <>{children}</>;
};
