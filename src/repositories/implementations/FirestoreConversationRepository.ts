import type { IConversationRepository } from '../interfaces/IConversationRepository';
import type { WhatsAppConversation } from '@/types/index';
import { conversationsService, type ConversationDocument } from '@/services/firestore/conversationsService';

export class FirestoreConversationRepository implements IConversationRepository {
  private documentToConversation(doc: ConversationDocument): WhatsAppConversation {
    return {
      id: doc.conversationId,
      contact: {
        id: doc.conversationId,
        name: doc.customerName,
        phoneNumber: doc.customerPhone,
        lastMessage: doc.lastMessage,
        lastMessageTime: doc.lastMessageTime,
        unreadCount: doc.unreadCount,
        isArchived: false,
        labels: [],
      },
      messages: [],
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      isActive: true,
    };
  }

  async getConversations(): Promise<WhatsAppConversation[]> {
    const docs = await conversationsService.getConversations();
    return docs.map((doc) => this.documentToConversation(doc));
  }

  async getConversation(conversationId: string): Promise<WhatsAppConversation | null> {
    const doc = await conversationsService.getConversation(conversationId);
    if (!doc) return null;
    return this.documentToConversation(doc);
  }

  async updateConversation(conversationId: string, data: Partial<WhatsAppConversation>): Promise<void> {
    const updateData: Partial<ConversationDocument> = {};
    
    if (data.contact?.name) updateData.customerName = data.contact.name;
    if (data.contact?.phoneNumber) updateData.customerPhone = data.contact.phoneNumber;
    if (data.contact?.lastMessage) updateData.lastMessage = data.contact.lastMessage;
    if (data.contact?.lastMessageTime) updateData.lastMessageTime = data.contact.lastMessageTime;
    if (data.contact?.unreadCount !== undefined) updateData.unreadCount = data.contact.unreadCount;
    
    await conversationsService.updateConversation(conversationId, updateData);
  }

  async searchConversation(query: string): Promise<WhatsAppConversation[]> {
    const docs = await conversationsService.searchConversations(query);
    return docs.map((doc) => this.documentToConversation(doc));
  }

  subscribeToConversations(callback: (conversations: WhatsAppConversation[]) => void): () => void {
    return conversationsService.subscribeToConversations((docs) => {
      const conversations = docs.map((doc) => this.documentToConversation(doc));
      callback(conversations);
    });
  }

  subscribeToConversation(conversationId: string, callback: (conversation: WhatsAppConversation | null) => void): () => void {
    return conversationsService.subscribeToConversation(conversationId, (doc) => {
      if (!doc) {
        callback(null);
        return;
      }
      callback(this.documentToConversation(doc));
    });
  }
}
