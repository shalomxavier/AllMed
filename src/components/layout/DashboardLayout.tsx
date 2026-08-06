import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { User, Briefcase } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuthContext } from '@/contexts/AuthContext';

export const DashboardLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const { userData } = useAuthContext();
  const location = useLocation();
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
    <div
      className="min-h-screen flex"
      style={
        isDmsWorkspace
          ? { backgroundColor: '#fbfbfb' }
          : {
              backgroundImage: 'url(/bg.jpg)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundAttachment: 'fixed',
            }
      }
    >
      <Sidebar isOpen={isSidebarOpen} onClose={handleSidebarClose} />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-between px-4 lg:px-6 h-16">
          {userData && (
            <div className="flex items-center gap-3 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full shadow-lg ml-auto">
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
        <main className="flex-1 px-4 sm:px-6 lg:px-8 pt-4 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
