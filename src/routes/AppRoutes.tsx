import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuthContext } from '@/contexts/AuthContext';
import { LoginPage } from '@pages/Login/LoginPage';
import { AttendancePage } from '@pages/Attendance/AttendancePage';
import { DMSPage } from '@pages/DMS/DMSPage';
import { WhatsAppEnquiryPage } from '@pages/DMS/WhatsAppEnquiryPage';
import { DashboardLayout } from '@components/layout/DashboardLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { AuthLoadingScreen } from '@/components/common';

// Route guard for authenticated users visiting /login
const LoginRoute: React.FC = () => {
  const { currentUser, loading } = useAuthContext();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (currentUser) {
    return <Navigate to="/attendance" replace />;
  }

  return <LoginPage />;
};

const AppRoutesContent: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/dms" element={<DMSPage />} />
        <Route path="/dms/whatsapp-enquiry" element={<WhatsAppEnquiryPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/attendance" replace />} />
    </Routes>
  );
};

export const AppRoutes: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutesContent />
      </AuthProvider>
    </BrowserRouter>
  );
};
