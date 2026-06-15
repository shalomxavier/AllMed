import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { MESSAGES_COLLECTION } from './config';

/**
 * Firestore trigger: Notify on new incoming message
 */
export const onNewMessage = functions.firestore
  .document('whatsapp_messages/{messageId}')
  .onCreate(async (snap) => {
    const message = snap.data();

    if (!message.isIncoming) return;

    console.log(`New incoming message from ${message.senderName}: ${message.content}`);
  });

/**
 * Scheduled function to sync message statuses (optional)
 */
export const syncMessageStatuses = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    try {
      const oneDayAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

      const pendingMessages = await MESSAGES_COLLECTION
        .where('isIncoming', '==', false)
        .where('timestamp', '>', oneDayAgo)
        .limit(100)
        .get();

      const filteredMessages = pendingMessages.docs.filter(doc => {
        const status = doc.data().status;
        return status === 'sent' || status === 'delivered';
      });

      console.log(`Found ${filteredMessages.length} messages to check status`);

      // TODO: Query Meta API for status updates if needed
    } catch (error) {
      console.error('Error in syncMessageStatuses:', error);
    }
  });
