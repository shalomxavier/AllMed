import * as functions from 'firebase-functions';
/**
 * HTTP function to send WhatsApp message (replaces onCall to avoid CORS issues)
 */
export declare const sendWhatsAppMessage: functions.HttpsFunction;
/**
 * Callable function to get conversations with pagination
 */
export declare const getConversations: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Callable function to get messages for a conversation
 */
export declare const getMessages: functions.HttpsFunction & functions.Runnable<any>;
/**
 * Callable function to mark conversation as read
 */
export declare const markConversationRead: functions.HttpsFunction & functions.Runnable<any>;
export declare const webhook: functions.HttpsFunction;
/**
 * Firestore trigger: Notify on new incoming message
 */
export declare const onNewMessage: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
/**
 * Scheduled function to sync message statuses (optional)
 */
export declare const syncMessageStatuses: functions.CloudFunction<unknown>;
