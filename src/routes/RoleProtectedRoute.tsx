import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { checkRoutePermission } from '@/permissions';
import { RedSpinner } from '@/components/common';

interface RoleProtectedRouteProps {
  children: React.ReactNode;
}

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

  const allowed = checkRoutePermission(permissions, path);
  let defaultPath = '/attendance';

  if (designation === 'Operations Manager' || designation === 'WhatsApp Messager') {
    defaultPath = '/dms';
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
