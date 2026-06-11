export interface User {
  id: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'admin' | 'manager' | 'staff';

export interface RouteConfig {
  path: string;
  element: React.ReactNode;
  isPublic?: boolean;
  allowedRoles?: UserRole[];
}

export interface LayoutProps {
  children: React.ReactNode;
}

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface HeaderProps {
  onMenuClick: () => void;
  user?: User | null;
}
