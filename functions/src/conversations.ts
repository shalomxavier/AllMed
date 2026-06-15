import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { CONVERSATIONS_COLLECTION, MESSAGES_COLLECTION } from './config';

/**
 * Callable function to get conversations with pagination
 */
export const getConversations = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { limit = 50, lastDocId } = data;

  try {
    let query = CONVERSATIONS_COLLECTION
      .where('isActive', '==', true)
      .orderBy('updatedAt', 'desc')
      .limit(limit);

    if (lastDocId) {
      const lastDoc = await CONVERSATIONS_COLLECTION.doc(lastDocId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const snapshot = await query.get();
    const conversations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {
      conversations,
      lastDocId: snapshot.docs[snapshot.docs.length - 1]?.id || null,
      hasMore: snapshot.docs.length === limit,
    };
  } catch (error) {
    console.error('Error fetching conversations:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch conversations');
  }
});

/**
 * Callable function to get messages for a conversation
 */
export const getMessages = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { conversationId, limit = 50, beforeMessageId } = data;

  if (!conversationId) {
    throw new functions.https.HttpsError('invalid-argument', 'Conversation ID is required');
  }

  try {
    let query = MESSAGES_COLLECTION
      .where('conversationId', '==', conversationId)
      .orderBy('timestamp', 'desc')
      .limit(limit);

    if (beforeMessageId) {
      const beforeDoc = await MESSAGES_COLLECTION.doc(beforeMessageId).get();
      if (beforeDoc.exists) {
        query = query.startAfter(beforeDoc);
      }
    }

    const snapshot = await query.get();
    const messages = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .reverse(); // Return in chronological order

    await CONVERSATIONS_COLLECTION.doc(conversationId).update({
      unreadCount: 0,
    });

    return {
      messages,
      hasMore: snapshot.docs.length === limit,
    };
  } catch (error) {
    console.error('Error fetching messages:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch messages');
  }
});

/**
 * Callable function to mark conversation as read
 */
export const markConversationRead = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { conversationId } = data;

  if (!conversationId) {
    throw new functions.https.HttpsError('invalid-argument', 'Conversation ID is required');
  }

  try {
    const docRef = CONVERSATIONS_COLLECTION.doc(conversationId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new functions.https.HttpsError('not-found', 'Conversation not found');
    }

    await docRef.update({
      'contact.unreadCount': 0,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error marking conversation as read:', error);
    if (error.code === 5) { // not-found
      throw new functions.https.HttpsError('not-found', 'Conversation not found');
    }
    throw new functions.https.HttpsError('internal', 'Failed to mark conversation as read');
  }
});
