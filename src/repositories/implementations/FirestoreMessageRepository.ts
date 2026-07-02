import type { IMessageRepository } from '../interfaces/IMessageRepository';
import type { WhatsAppMessage } from '@/types/index';
import { messagesService, type MessageDocument } from '@/services/firestore/messagesService';

export class FirestoreMessageRepository implements IMessageRepository {
  private documentToMessage(doc: MessageDocument): WhatsAppMessage {
    return {
      id: doc.messageId,
      conversationId: doc.conversationId,
      senderId: doc.sender,
      senderName: doc.sender,
      senderPhone: '',
      content: doc.content,
      type: doc.type as any,
      timestamp: doc.timestamp,
      status: doc.status,
      isIncoming: doc.isIncoming,
    };
  }

  async getMessages(conversationId: string): Promise<WhatsAppMessage[]> {
    const docs = await messagesService.getMessages(conversationId);
    return docs.map((doc) => this.documentToMessage(doc));
  }

  async sendMessage(conversationId: string, content: string): Promise<WhatsAppMessage> {
    const doc = await messagesService.sendMessage(conversationId, content, 'staff');
    return this.documentToMessage(doc);
  }

  async addIncomingMessage(conversationId: string, message: Omit<WhatsAppMessage, 'id'>): Promise<WhatsAppMessage> {
    const doc = await messagesService.addIncomingMessage({
      conversationId,
      sender: message.senderId,
      content: message.content,
      type: message.type as any,
      timestamp: message.timestamp,
      isIncoming: message.isIncoming,
      status: message.status,
    });
    return this.documentToMessage(doc);
  }

  subscribeToMessages(conversationId: string, callback: (messages: WhatsAppMessage[]) => void): () => void {
    return messagesService.subscribeToMessages(conversationId, (docs) => {
      const messages = docs.map((doc) => this.documentToMessage(doc));
      callback(messages);
    });
  }
}
