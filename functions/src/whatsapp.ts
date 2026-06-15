import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Request, Response } from 'express';
import axios from 'axios';
import {
  WHATSAPP_API_VERSION,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_ACCESS_TOKEN,
  CONVERSATIONS_COLLECTION,
  MESSAGES_COLLECTION,
} from './config';

/**
 * HTTP function to send WhatsApp message (replaces onCall to avoid CORS issues)
 */
export const sendWhatsAppMessage = functions.https.onRequest(async (req: Request, res: Response) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthenticated', message: 'Missing auth token' });
    return;
  }

  let uid: string;
  let tokenEmail: string | undefined;
  let tokenName: string | undefined;
  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    uid = decoded.uid;
    tokenEmail = decoded.email;
    tokenName = decoded.name;
  } catch (authErr: any) {
    console.error('Token verification failed:', authErr?.message || authErr);
    res.status(401).json({ error: 'unauthenticated', message: `Token error: ${authErr?.message || 'Invalid auth token'}` });
    return;
  }

  const { phoneNumber, message, conversationId, messageType = 'text' } = req.body;

  if (!phoneNumber || !message) {
    res.status(400).json({ error: 'invalid-argument', message: 'Phone number and message are required' });
    return;
  }

  try {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNumber,
      type: messageType,
    };

    if (messageType === 'text') {
      payload.text = { body: message };
    }
    // TODO: Add support for media messages (image, document, etc.)

    const response = await axios.post(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const whatsappMessageId = response.data.messages?.[0]?.id;

    const now = admin.firestore.Timestamp.now();
    const messageRef = await MESSAGES_COLLECTION.add({
      conversationId: conversationId || `conv_${phoneNumber}`,
      senderId: uid,
      senderName: tokenName || 'ALLMED Support',
      senderPhone: '+91 80000 00000', // Update with your business number
      content: message,
      type: messageType,
      timestamp: now,
      status: 'sent',
      isIncoming: false,
      whatsappMessageId,
      sentBy: {
        uid,
        email: tokenEmail,
      },
    });

    const conversationRef = CONVERSATIONS_COLLECTION.doc(conversationId || `conv_${phoneNumber}`);
    const conversationDoc = await conversationRef.get();

    if (conversationDoc.exists) {
      await conversationRef.update({
        'contact.lastMessage': message,
        'contact.lastMessageTime': now,
        updatedAt: now,
      });
    } else {
      await conversationRef.set({
        id: conversationId || `conv_${phoneNumber}`,
        contact: {
          id: `contact_${phoneNumber}`,
          phoneNumber,
          name: null,
          profilePicture: null,
          lastMessage: message,
          lastMessageTime: now,
          unreadCount: 0,
          isArchived: false,
          labels: [],
        },
        createdAt: now,
        updatedAt: now,
        isActive: true,
      });
    }

    res.status(200).json({
      success: true,
      messageId: messageRef.id,
      whatsappMessageId,
    });
    return;
  } catch (error: any) {
    const metaError = error.response?.data;
    console.error('Error sending WhatsApp message:', JSON.stringify({
      status: error.response?.status,
      data: metaError,
      phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
      tokenPresent: !!WHATSAPP_ACCESS_TOKEN,
      tokenPrefix: WHATSAPP_ACCESS_TOKEN?.substring(0, 20),
      message: error.message,
    }));
    res.status(500).json({
      error: 'internal',
      message: metaError?.error?.message || error.message || 'Failed to send message',
    });
    return;
  }
});
