import type { LostReason } from './types';

export interface LostCustomer {
  id: string;
  conversationId: string;
  customerName: string;
  customerPhone: string;
  storeWhatsAppNumber: string;
  storeName: string;
  lostReason: LostReason;
  customReason?: string;
  lostDate: Date;
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
