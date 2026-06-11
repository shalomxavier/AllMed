import { Menu, Bell, LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import type { HeaderProps } from '@/types/index';

const getPageTitle = (pathname: string): string => {
  switch (pathname) {
    case '/attendance':
      return 'Attendance Management';
    case '/dms':
      return 'DMS';
    default:
      return 'Dashboard';
  }
};

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const pageTitle = getPageTitle(location.pathname);

  const handleLogout = async (): Promise<void> => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      // Error handled by AuthContext
    }
  };

  // Get first letter of email for avatar
  const getAvatarInitial = (): string => {
    if (!currentUser?.email) return '?';
    return currentUser.email.charAt(0).toUpperCase();
  };

  // Get display email
  const getUserEmail = (): string => {
    return currentUser?.email || 'Unknown';
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-secondary-200 shadow-sm">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 text-secondary-500 hover:text-secondary-700 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <h2 className="text-lg font-semibold text-secondary-900 hidden sm:block">
            {pageTitle}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Notification Bell */}
          <button
            className="p-2 text-secondary-500 hover:text-secondary-700 transition-colors relative"
            aria-label="Notifications"
          >
            <Bell size={20} />
          </button>

          {/* User Profile */}
          <div className="flex items-center gap-3 pl-4 border-l border-secondary-200">
            {/* User Avatar - First letter of email */}
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {getAvatarInitial()}
              </span>
            </div>
            {/* User Email */}
            <div className="hidden md:block">
              <p className="text-sm font-medium text-secondary-900 truncate max-w-[150px]">
                {getUserEmail()}
              </p>
              <p className="text-xs text-secondary-500">Administrator</p>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="ml-2 p-2 text-secondary-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
