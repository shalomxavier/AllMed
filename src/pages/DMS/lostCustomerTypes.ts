import type { LostReason } from './types';
import type { DeliveryStatus } from '@/types/index';

export interface LostCustomer {
  id: string;
  conversationId: string;
  customerName: string;
  customerPhone: string;
  businessPhoneNumber: string;
  storeWhatsAppNumber: string;
  storeName: string;
  deliveryStatus: DeliveryStatus;
  lostReason: LostReason;
  customReason?: string;
  internalNotes?: string;
  createdAt: Date;
  updatedAt: Date;
  lostDate: Date;
  responseTime?: string;
  messages: LostCustomerMessage[];
}

export interface LostCustomerMessage {
  id: string;
  content: string;
  timestamp: Date;
  isIncoming: boolean;
  senderName: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video';
}
