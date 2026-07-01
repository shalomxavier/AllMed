import type { WhatsAppMessage } from '@/types/index';

export interface IMessageRepository {
  getMessages(conversationId: string): Promise<WhatsAppMessage[]>;
  sendMessage(conversationId: string, content: string): Promise<WhatsAppMessage>;
  addIncomingMessage(conversationId: string, message: Omit<WhatsAppMessage, 'id'>): Promise<WhatsAppMessage>;
  subscribeToMessages(conversationId: string, callback: (messages: WhatsAppMessage[]) => void): () => void;
}
