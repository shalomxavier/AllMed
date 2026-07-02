import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, orderBy, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from '@/firebase/firebase';

export interface ConversationDocument {
  conversationId: string;
  customerPhone: string;
  customerName: string;
  storeId: string;
  staffId: string;
  status: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export const conversationsService = {
  async getConversation(conversationId: string): Promise<ConversationDocument | null> {
    const docRef = doc(db, 'conversations', conversationId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return {
      conversationId: docSnap.id,
      ...docSnap.data(),
    } as ConversationDocument;
  },

  async getConversations(filters?: { storeId?: string; staffId?: string }): Promise<ConversationDocument[]> {
    const constraints = [];
    
    if (filters?.storeId) {
      constraints.push(where('storeId', '==', filters.storeId));
    }
    
    if (filters?.staffId) {
      constraints.push(where('staffId', '==', filters.staffId));
    }
    
    constraints.push(orderBy('lastMessageTime', 'desc'));
    
    const q = query(collection(db, 'conversations'), ...constraints);
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      conversationId: doc.id,
      ...doc.data(),
    } as ConversationDocument));
  },

  async createConversation(data: Omit<ConversationDocument, 'conversationId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = doc(collection(db, 'conversations'));
    const conversationId = docRef.id;
    
    const now = new Date();
    await setDoc(docRef, {
      ...data,
      conversationId,
      createdAt: now,
      updatedAt: now,
    });
    
    return conversationId;
  },

  async updateConversation(conversationId: string, data: Partial<ConversationDocument>): Promise<void> {
    const docRef = doc(db, 'conversations', conversationId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date(),
    });
  },

  async searchConversations(searchQuery: string): Promise<ConversationDocument[]> {
    const q = query(
      collection(db, 'conversations'),
      orderBy('lastMessageTime', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const allConversations = querySnapshot.docs.map((doc) => ({
      conversationId: doc.id,
      ...doc.data(),
    } as ConversationDocument));
    
    const lowerQuery = searchQuery.toLowerCase();
    return allConversations.filter((conv) =>
      conv.customerName?.toLowerCase().includes(lowerQuery) ||
      conv.customerPhone?.includes(searchQuery)
    );
  },

  subscribeToConversations(
    callback: (conversations: ConversationDocument[]) => void,
    filters?: { storeId?: string; staffId?: string }
  ): Unsubscribe {
    const constraints = [];
    
    if (filters?.storeId) {
      constraints.push(where('storeId', '==', filters.storeId));
    }
    
    if (filters?.staffId) {
      constraints.push(where('staffId', '==', filters.staffId));
    }
    
    constraints.push(orderBy('lastMessageTime', 'desc'));
    
    const q = query(collection(db, 'conversations'), ...constraints);
    
    return onSnapshot(q, (snapshot) => {
      const conversations = snapshot.docs.map((doc) => ({
        conversationId: doc.id,
        ...doc.data(),
      } as ConversationDocument));
      callback(conversations);
    });
  },

  subscribeToConversation(
    conversationId: string,
    callback: (conversation: ConversationDocument | null) => void
  ): Unsubscribe {
    const docRef = doc(db, 'conversations', conversationId);
    
    return onSnapshot(docRef, (doc) => {
      if (!doc.exists()) {
        callback(null);
        return;
      }
      
      callback({
        conversationId: doc.id,
        ...doc.data(),
      } as ConversationDocument);
    });
  },
};
