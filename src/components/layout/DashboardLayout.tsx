import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const DashboardLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  const handleSidebarClose = (): void => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-secondary-50 flex">
      <Sidebar isOpen={isSidebarOpen} onClose={handleSidebarClose} />

      <div className="flex-1 min-w-0">
        <main className="pt-4 lg:pt-6 px-12 lg:pr-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
