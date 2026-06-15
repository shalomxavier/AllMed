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

// WhatsApp Types
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';
export type MessageType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'location';

export interface WhatsAppMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderPhone: string;
  content: string;
  type: MessageType;
  timestamp: Date;
  status: MessageStatus;
  isIncoming: boolean;
  mediaUrl?: string;
  caption?: string;
  fileName?: string;
  mimeType?: string;
}

export type DeliveryStatus = 'delivered' | 'not_delivered' | 'pending' | null;

export interface WhatsAppContact {
  id: string;
  phoneNumber: string;
  name: string | null;
  profilePicture?: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount: number;
  isArchived: boolean;
  labels: string[];
  deliveryStatus?: DeliveryStatus;
}

export interface WhatsAppConversation {
  id: string;
  contact: WhatsAppContact;
  messages: WhatsAppMessage[];
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}
