import type { WhatsAppConversation } from '@/types/index';

export interface IConversationRepository {
  getConversations(): Promise<WhatsAppConversation[]>;
  getConversation(conversationId: string): Promise<WhatsAppConversation | null>;
  updateConversation(conversationId: string, data: Partial<WhatsAppConversation>): Promise<void>;
  searchConversation(query: string): Promise<WhatsAppConversation[]>;
  subscribeToConversations(callback: (conversations: WhatsAppConversation[]) => void): () => void;
  subscribeToConversation(conversationId: string, callback: (conversation: WhatsAppConversation | null) => void): () => void;
}
