import { collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, orderBy, onSnapshot, Unsubscribe, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/firebase';

export interface MessageDocument {
  messageId: string;
  conversationId: string;
  sender: string;
  content: string;
  type: 'text' | 'image' | 'document' | 'audio';
  timestamp: Date;
  isIncoming: boolean;
  status: 'sent' | 'delivered' | 'read' | 'failed';
}

export const messagesService = {
  async getMessages(conversationId: string): Promise<MessageDocument[]> {
    const q = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
      orderBy('timestamp', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      messageId: doc.id,
      ...doc.data(),
    } as MessageDocument));
  },

  async sendMessage(conversationId: string, content: string, sender: string = 'staff'): Promise<MessageDocument> {
    const docRef = await addDoc(collection(db, 'messages'), {
      conversationId,
      sender,
      content,
      type: 'text',
      timestamp: serverTimestamp(),
      isIncoming: false,
      status: 'sent',
    });
    
    const docSnap = await getDoc(docRef);
    return {
      messageId: docSnap.id,
      ...docSnap.data(),
    } as MessageDocument;
  },

  async addIncomingMessage(message: Omit<MessageDocument, 'messageId'>): Promise<MessageDocument> {
    const docRef = await addDoc(collection(db, 'messages'), {
      ...message,
      timestamp: serverTimestamp(),
    });
    
    const docSnap = await getDoc(docRef);
    return {
      messageId: docSnap.id,
      ...docSnap.data(),
    } as MessageDocument;
  },

  async updateMessageStatus(messageId: string, status: 'sent' | 'delivered' | 'read' | 'failed'): Promise<void> {
    const docRef = doc(db, 'messages', messageId);
    await updateDoc(docRef, { status });
  },

  subscribeToMessages(
    conversationId: string,
    callback: (messages: MessageDocument[]) => void
  ): Unsubscribe {
    const q = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
      orderBy('timestamp', 'asc')
    );
    
    return onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map((doc) => ({
        messageId: doc.id,
        ...doc.data(),
      } as MessageDocument));
      callback(messages);
    });
  },
};
