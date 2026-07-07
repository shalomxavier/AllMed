import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuthContext } from '@/contexts/AuthContext';
import { LoginPage } from '@pages/Login/LoginPage';
import { AttendancePage } from '@pages/Attendance/AttendancePage';
import { EmployeesPage } from '@pages/Attendance/EmployeesPage';
import { RawPunchesPage } from '@pages/Attendance/RawPunchesPage';
import { ShiftsPage } from '@pages/Attendance/ShiftsPage';
import { LeavesPage } from '@pages/Attendance/LeavesPage';
import { DevicesPage } from '@pages/Attendance/DevicesPage';
import { UsersPage } from '@pages/Users/UsersPage';
import { DMSPage } from '@pages/DMS/DMSPage';
import { WhatsAppEnquiryPage } from '@pages/DMS/WhatsAppEnquiryPage';
import { WorkspacePage } from '@pages/DMS/WorkspacePage';
import { DashboardPage } from '@pages/DMS/DashboardPage';
import { LostCustomersPage } from '@pages/DMS/LostCustomersPage';
import { AnalyticsPage } from '@pages/DMS/AnalyticsPage';
import { ReportsPage } from '@pages/DMS/ReportsPage';
import { StoresPage } from '@pages/DMS/StoresPage';
import { SettingsPage } from '@pages/DMS/SettingsPage';
import { DashboardLayout } from '@components/layout/DashboardLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleProtectedRoute } from './RoleProtectedRoute';
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
            <RoleProtectedRoute>
              <DashboardLayout />
            </RoleProtectedRoute>
          </ProtectedRoute>
        }
      >
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/attendance/employees" element={<EmployeesPage />} />
        <Route path="/attendance/records" element={<RawPunchesPage />} />
        <Route path="/attendance/shifts" element={<ShiftsPage />} />
        <Route path="/attendance/leaves" element={<LeavesPage />} />
        <Route path="/attendance/devices" element={<DevicesPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/dms" element={<DMSPage />} />
        <Route path="/dms/workspace" element={<WorkspacePage />} />
        <Route path="/dms/dashboard" element={<DashboardPage />} />
        <Route path="/dms/lost-customers" element={<LostCustomersPage />} />
        <Route path="/dms/analytics" element={<AnalyticsPage />} />
        <Route path="/dms/reports" element={<ReportsPage />} />
        <Route path="/dms/stores" element={<StoresPage />} />
        <Route path="/dms/settings" element={<SettingsPage />} />
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
