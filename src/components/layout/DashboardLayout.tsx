import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { User, Briefcase } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuthContext } from '@/contexts/AuthContext';

const getPageTitle = (pathname: string): string => {
  if (pathname === '/attendance') return 'Attendance Management';
  if (pathname === '/attendance/employees') return 'Employees';
  if (pathname === '/attendance/records') return 'Attendances';
  if (pathname === '/attendance/shifts') return 'Shifts';
  if (pathname === '/attendance/leaves') return 'Leaves';
  if (pathname === '/attendance/devices') return 'Devices';
  if (pathname === '/attendance/designations') return 'Designations';
  if (pathname === '/attendance/departments') return 'Departments';
  if (pathname === '/users') return 'Users';
  if (pathname === '/dms') return 'DMS';
  if (pathname === '/dms/workspace') return 'Customer Workspace';
  if (pathname === '/dms/dashboard') return 'Manager Dashboard';
  if (pathname === '/dms/lost-customers') return 'Lost Customers';
  if (pathname === '/dms/whatsapp-enquiry') return 'WhatsApp Enquiry';
  return 'AllMed';
};

export const DashboardLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const { userData } = useAuthContext();
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);
  const isDmsWorkspace = location.pathname.startsWith('/dms/workspace');
  const isWhatsAppMessager = userData?.designation === 'WhatsApp Messager';
  const isWhatsAppEnquiryPage = location.pathname === '/dms/whatsapp-enquiry';

  const handleSidebarClose = (): void => {
    setIsSidebarOpen(false);
  };

  // WhatsApp Messager gets a simplified layout - just the WhatsApp interface
  if (isWhatsAppMessager && isWhatsAppEnquiryPage) {
    return (
      <div className="min-h-screen bg-secondary-50">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary-50 flex">
      <Sidebar isOpen={isSidebarOpen} onClose={handleSidebarClose} />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-between px-4 lg:px-6 py-3 bg-white border-b border-secondary-200">
          <h1 className="text-xl font-bold text-secondary-900">{pageTitle}</h1>
          {userData && (
            <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-full border border-secondary-200 shadow-sm">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                <User size={16} className="text-primary-600" />
              </div>
              <div className="flex flex-col">
                <p className="text-sm font-medium text-secondary-900 leading-tight">{userData.name}</p>
                <div className="flex items-center gap-1 text-xs text-secondary-500">
                  <Briefcase size={10} />
                  <span>{userData.designation}</span>
                </div>
              </div>
            </div>
          )}
        </header>
        <main
          className="flex-1 px-4 sm:px-6 lg:px-8 pt-4 overflow-y-auto"
          style={{ backgroundColor: isDmsWorkspace ? '#fbfbfb' : undefined }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};
