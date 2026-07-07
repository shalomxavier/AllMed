import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { User, Briefcase } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuthContext } from '@/contexts/AuthContext';

export const DashboardLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const { userData } = useAuthContext();

  const handleSidebarClose = (): void => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-secondary-50 flex">
      <Sidebar isOpen={isSidebarOpen} onClose={handleSidebarClose} />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-end px-4 lg:px-6 py-3 bg-white border-b border-secondary-200 lg:bg-transparent lg:border-none">
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
        <main className="flex-1 pt-4 lg:pt-6 px-12 lg:pr-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
