import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { User, Briefcase, Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { ToastProvider } from '@/components/common';
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

  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSidebarOpen]);

  // WhatsApp Messager gets a simplified layout - just the WhatsApp interface
  if (isWhatsAppMessager && isWhatsAppEnquiryPage) {
    return (
      <ToastProvider>
        <div className="min-h-screen bg-secondary-50">
          <Outlet />
        </div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
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
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg text-secondary-600 bg-white border border-secondary-200 shadow-sm hover:bg-secondary-50 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          {userData && (
            <div className="flex items-center gap-3 px-4 py-2 bg-white border border-secondary-200 rounded-full shadow-sm ml-auto">
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
    </ToastProvider>
  );
};
