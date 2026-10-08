import { X, CalendarDays, Truck, Users, LogOut, Building, Briefcase, Building2, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import type { SidebarProps } from '@/types/index';
import { useAuthContext } from '@/contexts/AuthContext';
import { hasTopLevelModuleAccess, hasModuleAccess, hasPermission } from '@/permissions';
import { useState, useEffect } from 'react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

interface SubNavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  item: string;
}

const navItems: NavItem[] = [
  {
    path: '/attendance',
    label: 'Attendance',
    icon: <CalendarDays size={20} />,
  },
  {
    path: '/dms',
    label: 'DMS',
    icon: <Truck size={20} />,
  },
  {
    path: '/users',
    label: 'Users',
    icon: <Users size={20} />,
  },
];

const masterSubItems: SubNavItem[] = [
  {
    path: '/attendance/branches',
    label: 'Branches',
    icon: <Building size={18} />,
    item: 'branches',
  },
  {
    path: '/attendance/designations',
    label: 'Designations',
    icon: <Briefcase size={18} />,
    item: 'designations',
  },
  {
    path: '/attendance/departments',
    label: 'Departments',
    icon: <Building2 size={18} />,
    item: 'departments',
  },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { logout, userData, permissions: rolePermissions } = useAuthContext();
  const [masterExpanded, setMasterExpanded] = useState(false);

  // Auto-collapse Master section when main nav items are selected
  useEffect(() => {
    const mainNavPaths = ['/attendance', '/dms', '/users'];
    if (mainNavPaths.includes(location.pathname)) {
      setMasterExpanded(false);
    }
  }, [location.pathname]);

  const effectivePermissions = (() => {
    // AuthContext already exposes resolved permissions; fall back to designation-based
    // derivation if permissions are somehow unavailable during migration.
    if (rolePermissions) return rolePermissions;
    if (!userData) return null;
    switch (userData.designation) {
      case 'HR':
        return { employees: { accessMode: 'full' as const }, users: { accessMode: 'full' as const } };
      case 'Operations Manager':
        return { dms: { accessMode: 'full' as const }, users: { accessMode: 'full' as const } };
      case 'WhatsApp Messager':
        return { dms: { accessMode: 'full' as const } };
      case 'Branch Manager':
        return {
          employees: { accessMode: 'full' as const },
          attendanceLogs: { accessMode: 'full' as const },
          shifts: { accessMode: 'full' as const },
          leaves: { accessMode: 'full' as const },
          reports: { accessMode: 'full' as const },
          insights: { accessMode: 'full' as const },
        };
      case 'Director':
        return {};
      default:
        return null;
    }
  })();

  const visibleNavItems = (() => {
    if (effectivePermissions === null) return [];
    if (Object.keys(effectivePermissions).length === 0) return navItems;
    return navItems.filter((item) => {
      const key = item.path.replace('/', '') as 'attendance' | 'dms' | 'users';
      return hasTopLevelModuleAccess(effectivePermissions, key);
    });
  })();

  const visibleMasterSubItems = (() => {
    if (!rolePermissions) return masterSubItems;
    return masterSubItems.filter((item) =>
      hasPermission(rolePermissions, 'masters', item.item, 'view'));
  })();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-secondary-900/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 bg-white border-r border-secondary-200 shadow-xl rounded-r-2xl transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden lg:visible lg:rounded-none lg:shadow-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full invisible'
        }`}
      >
        {/* Company Branding */}
        <div className="relative flex items-center justify-center h-24 px-6 border-b border-secondary-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center">
              <img src="/allmed_logo.png" alt="AllMed Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="text-xl font-bold text-primary-600 block leading-tight">ALLMED-ALLRISE</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="absolute right-6 lg:hidden p-2 text-secondary-500 hover:text-secondary-700 transition-colors"
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {visibleNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => {
                  onClose();
                  setMasterExpanded(false);
                }}
                className={`flex items-center gap-3 px-4 py-3 font-medium transition-colors duration-200 ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 rounded-lg'
                    : 'text-black hover:bg-secondary-50 hover:text-secondary-900 rounded-lg'
                }`}
              >
                <span className={isActive ? 'text-primary-700' : 'text-black'}>
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            );
          })}

          {/* Master Section - Hidden for Branch Manager and HR, shown based on RBAC masters permission when available */}
          {((rolePermissions && hasModuleAccess(rolePermissions, 'masters')) ||
            (!rolePermissions && userData?.designation !== 'Branch Manager' && userData?.designation !== 'HR')) && (
            <div className="mt-4">
              <button
                onClick={() => setMasterExpanded(!masterExpanded)}
                className={`flex items-center justify-between w-full px-4 py-3 font-medium transition-colors duration-200 rounded-lg ${
                  masterExpanded || masterSubItems.some(item => location.pathname === item.path)
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-black hover:bg-secondary-50 hover:text-secondary-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={masterExpanded || masterSubItems.some(item => location.pathname === item.path) ? 'text-primary-700' : 'text-black'}>
                    <Settings size={20} />
                  </span>
                  Master
                </div>
                {masterExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {masterExpanded && (
                <div className="ml-4 mt-1 space-y-1">
                  {visibleMasterSubItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={() => onClose()}
                        className={`flex items-center gap-3 px-4 py-2.5 font-medium transition-colors duration-200 rounded-lg ${
                          isActive
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-black hover:bg-secondary-50 hover:text-secondary-900'
                        }`}
                      >
                        <span className={isActive ? 'text-primary-700' : 'text-black'}>
                          {item.icon}
                        </span>
                        {item.label}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-2 border-t border-secondary-200">
          <button
            onClick={logout}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
};
