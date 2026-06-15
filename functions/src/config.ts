import * as admin from 'firebase-admin';

export const db = admin.firestore();
export const messaging = admin.messaging();

export const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v25.0';
export const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
export const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
export const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

export const CONVERSATIONS_COLLECTION = db.collection('whatsapp_conversations');
export const MESSAGES_COLLECTION = db.collection('whatsapp_messages');
