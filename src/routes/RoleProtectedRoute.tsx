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

  const isAttendancePath = path === '/attendance' || path.startsWith('/attendance/');
  const isUsersPath = path === '/users' || path.startsWith('/users/');
  const isDmsPath = path === '/dms' || path.startsWith('/dms/');

  let allowed = false;
  if (designation === 'HR') {
    allowed = isAttendancePath || isUsersPath;
  } else if (designation === 'Operations Manager') {
    allowed = isDmsPath || isUsersPath;
  } else if (designation === 'WhatsApp Messager') {
    allowed = isDmsPath;
  } else {
    allowed = true;
  }

  if (!allowed) {
    const defaultPath = designation === 'Operations Manager' || designation === 'WhatsApp Messager' ? '/dms' : '/attendance';
    return <Navigate to={defaultPath} replace />;
  }

  // Redirect WhatsApp Messager directly to WhatsApp Enquiry page
  if (designation === 'WhatsApp Messager' && path === '/dms') {
    return <Navigate to="/dms/whatsapp-enquiry" replace />;
  }

  return <>{children}</>;
};
