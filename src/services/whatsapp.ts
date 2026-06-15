import { functions, db, auth } from '@/firebase/firebase';
import { httpsCallable } from 'firebase/functions';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  doc, 
  getDoc,
  updateDoc,
  serverTimestamp,
  type Unsubscribe 
} from 'firebase/firestore';
import type { WhatsAppMessage, WhatsAppConversation } from '@/types/index';

// Callable functions (getConversations and getMessages remain as onCall)
const getConversationsFn = httpsCallable(functions, 'getConversations');
const getMessagesFn = httpsCallable(functions, 'getMessages');

const SEND_MESSAGE_URL = 'https://us-central1-allmed-hrms.cloudfunctions.net/sendWhatsAppMessage';

// Firestore collection references
const conversationsRef = collection(db, 'whatsapp_conversations');
const messagesRef = collection(db, 'whatsapp_messages');

/**
 * Subscribe to real-time conversation updates
 */
export const subscribeToConversations = (
  callback: (conversations: WhatsAppConversation[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const q = query(
    conversationsRef,
    where('isActive', '==', true),
    orderBy('updatedAt', 'desc'),
    limit(100)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const conversations = snapshot.docs.map((doc) => {
        const data = doc.data();
        console.log('[DEBUG] conv raw data:', JSON.stringify({ id: doc.id, lastMessage: data.lastMessage, lastMessageTime: data.lastMessageTime, contact: data.contact }));
        const contact = data.contact || {};
        const rawLastMsgTime = contact.lastMessageTime ?? data.lastMessageTime;
        return {
          id: doc.id,
          contact: {
            ...contact,
            lastMessage: contact.lastMessage ?? data.lastMessage,
            unreadCount: contact.unreadCount ?? data.unreadCount ?? 0,
            lastMessageTime: rawLastMsgTime?.toDate ? rawLastMsgTime.toDate() : rawLastMsgTime,
            deliveryStatus: contact.deliveryStatus ?? data.deliveryStatus ?? null,
          },
          messages: [], // Messages loaded separately
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          isActive: data.isActive,
        } as WhatsAppConversation;
      });
      callback(conversations);
    },
    (error) => {
      console.error('Error subscribing to conversations:', error);
      onError?.(error);
    }
  );
};

/**
 * Subscribe to messages for a specific conversation
 */
export const subscribeToMessages = (
  conversationId: string,
  callback: (messages: WhatsAppMessage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const q = query(
    messagesRef,
    where('conversationId', '==', conversationId),
    orderBy('timestamp', 'asc'),
    limit(200)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const messages = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          conversationId: data.conversationId,
          senderId: data.senderId,
          senderName: data.senderName,
          senderPhone: data.senderPhone,
          content: data.content,
          type: data.type || 'text',
          timestamp: data.timestamp?.toDate() || new Date(),
          status: data.status || 'sent',
          isIncoming: data.isIncoming,
          mediaUrl: data.mediaUrl,
          caption: data.caption,
          fileName: data.fileName,
          mimeType: data.mimeType,
        } as WhatsAppMessage;
      });
      callback(messages);
    },
    (error) => {
      console.error('Error subscribing to messages:', error);
      onError?.(error);
    }
  );
};

/**
 * Send a WhatsApp message
 */
export const sendWhatsAppMessage = async (
  phoneNumber: string,
  message: string,
  conversationId?: string
): Promise<{ messageId: string; whatsappMessageId: string }> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const idToken = await user.getIdToken();
  const response = await fetch(SEND_MESSAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      phoneNumber,
      message,
      conversationId: conversationId || `conv_${phoneNumber}`,
      messageType: 'text',
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `HTTP ${response.status}: Failed to send message`);
  }
  return data as { messageId: string; whatsappMessageId: string };
};

/**
 * Get paginated conversations
 */
export const getConversations = async (
  limit: number = 50,
  lastDocId?: string
): Promise<{ conversations: WhatsAppConversation[]; lastDocId: string | null; hasMore: boolean }> => {
  const result = await getConversationsFn({ limit, lastDocId });
  return result.data as { conversations: WhatsAppConversation[]; lastDocId: string | null; hasMore: boolean };
};

/**
 * Get messages for a conversation (pagination)
 */
export const getMessages = async (
  conversationId: string,
  limit: number = 50,
  beforeMessageId?: string
): Promise<{ messages: WhatsAppMessage[]; hasMore: boolean }> => {
  const result = await getMessagesFn({ conversationId, limit, beforeMessageId });
  return result.data as { messages: WhatsAppMessage[]; hasMore: boolean };
};

/**
 * Mark conversation as read
 */
export const markConversationRead = async (conversationId: string): Promise<void> => {
  const docRef = doc(db, 'whatsapp_conversations', conversationId);
  await updateDoc(docRef, {
    'contact.unreadCount': 0,
    unreadCount: 0,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Get single conversation by ID
 */
export const getConversation = async (conversationId: string): Promise<WhatsAppConversation | null> => {
  const docRef = doc(db, 'whatsapp_conversations', conversationId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();
  return {
    id: docSnap.id,
    contact: data.contact,
    messages: [],
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    isActive: data.isActive,
  } as WhatsAppConversation;
};

/**
 * Update delivery status for a conversation
 */
export const updateDeliveryStatus = async (
  conversationId: string,
  status: 'delivered' | 'not_delivered' | 'pending',
  reason?: string
): Promise<void> => {
  const docRef = doc(db, 'whatsapp_conversations', conversationId);
  const updateData: any = {
    'contact.deliveryStatus': status,
    updatedAt: serverTimestamp(),
  };

  if (reason) {
    updateData['contact.deliveryReason'] = reason;
  }

  await updateDoc(docRef, updateData);
};
