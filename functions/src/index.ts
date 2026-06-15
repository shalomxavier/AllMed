import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// Express app for webhooks
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Meta WhatsApp API Configuration
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v25.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
// WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID (895316626273968) - available via env if needed
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// Collection references
const CONVERSATIONS_COLLECTION = db.collection('whatsapp_conversations');
const MESSAGES_COLLECTION = db.collection('whatsapp_messages');

/**
 * Webhook verification endpoint - Meta calls this to verify the webhook
 */
app.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

/**
 * Webhook message receiver - Meta sends incoming messages here
 */
app.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Check if this is a WhatsApp API event
    if (body.object !== 'whatsapp_business_account') {
      return res.sendStatus(404);
    }

    // Process each entry
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        // Handle messages
        if (value.messages && value.messages.length > 0) {
          for (const message of value.messages) {
            await processIncomingMessage(message, value.contacts?.[0], value.metadata);
          }
        }

        // Handle message status updates (delivered, read, etc.)
        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            await processMessageStatus(status);
          }
        }
      }
    }

    res.sendStatus(200);
    return;
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.sendStatus(500);
    return;
  }
});

/**
 * Process an incoming WhatsApp message
 */
async function processIncomingMessage(
  message: any,
  contact: any,
  metadata: any
): Promise<void> {
  const phoneNumber = contact?.wa_id;
  const contactName = contact?.profile?.name || null;
  const businessPhoneNumberId = metadata?.phone_number_id;

  if (!phoneNumber) {
    console.error('No phone number in incoming message');
    return;
  }

  // Find or create conversation
  const conversationId = `conv_${phoneNumber}`;
  const conversationRef = CONVERSATIONS_COLLECTION.doc(conversationId);
  const conversationDoc = await conversationRef.get();

  const now = admin.firestore.Timestamp.now();

  // Extract message content based on type
  let content = '';
  let mediaUrl = null;
  let caption = null;
  let mimeType = null;
  let fileName = null;

  switch (message.type) {
    case 'text':
      content = message.text?.body || '';
      break;
    case 'image':
      content = '[Image]';
      mediaUrl = message.image?.id || null;
      caption = message.image?.caption || null;
      mimeType = message.image?.mime_type || null;
      break;
    case 'document':
      content = '[Document]';
      mediaUrl = message.document?.id || null;
      caption = message.document?.caption || null;
      fileName = message.document?.filename || null;
      mimeType = message.document?.mime_type || null;
      break;
    case 'audio':
      content = '[Audio]';
      mediaUrl = message.audio?.id || null;
      mimeType = message.audio?.mime_type || null;
      break;
    case 'video':
      content = '[Video]';
      mediaUrl = message.video?.id || null;
      caption = message.video?.caption || null;
      mimeType = message.video?.mime_type || null;
      break;
    case 'location':
      const lat = message.location?.latitude;
      const long = message.location?.longitude;
      content = lat && long ? `Location: ${lat}, ${long}` : '[Location]';
      break;
    default:
      content = `[${message.type}]`;
  }

  // Create message document
  const messageData = {
    conversationId,
    senderId: phoneNumber,
    senderName: contactName || phoneNumber,
    senderPhone: phoneNumber,
    content,
    type: message.type || 'text',
    timestamp: now,
    status: 'delivered',
    isIncoming: true,
    mediaUrl,
    caption,
    fileName,
    mimeType,
    whatsappMessageId: message.id,
    rawPayload: message, // Store full payload for reference
  };

  await MESSAGES_COLLECTION.add(messageData);

  // Update or create conversation
  if (conversationDoc.exists) {
    await conversationRef.update({
      'contact.lastMessage': content,
      'contact.lastMessageTime': now,
      'contact.unreadCount': admin.firestore.FieldValue.increment(1),
      updatedAt: now,
    });
  } else {
    await conversationRef.set({
      id: conversationId,
      contact: {
        id: `contact_${phoneNumber}`,
        phoneNumber,
        name: contactName,
        profilePicture: null,
        lastMessage: content,
        lastMessageTime: now,
        unreadCount: 1,
        isArchived: false,
        labels: [],
      },
      createdAt: now,
      updatedAt: now,
      isActive: true,
      businessPhoneNumberId,
    });
  }

  // Send notification to user's device
  try {
    await messaging.send({
      notification: {
        title: contactName || 'New Message',
        body: content,
      },
      topic: `conversation_${conversationId}`,
    });
  } catch (notifyError) {
    console.log('Notification failed (expected if no subscribers):', notifyError);
  }

  console.log(`Processed incoming message from ${phoneNumber}: ${content.substring(0, 50)}`);
}

/**
 * Process message status update (sent, delivered, read, failed)
 */
async function processMessageStatus(status: any): Promise<void> {
  const whatsappMessageId = status.id;
  const statusValue = status.status; // sent, delivered, read, failed

  // Find message by WhatsApp message ID
  const messagesSnapshot = await MESSAGES_COLLECTION
    .where('whatsappMessageId', '==', whatsappMessageId)
    .limit(1)
    .get();

  if (messagesSnapshot.empty) {
    console.log(`Message ${whatsappMessageId} not found for status update`);
    return;
  }

  const messageDoc = messagesSnapshot.docs[0];
  await messageDoc.ref.update({
    status: statusValue,
    statusUpdatedAt: admin.firestore.Timestamp.now(),
  });

  console.log(`Updated message ${whatsappMessageId} status to ${statusValue}`);
}

/**
 * HTTP function to send WhatsApp message (replaces onCall to avoid CORS issues)
 */
export const sendWhatsAppMessage = functions.https.onRequest(async (req: Request, res: Response) => {
  // Handle CORS preflight
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

  // Verify Firebase Auth token
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
    // Build the message payload for Meta API
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

    // Send to Meta WhatsApp API
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

    // Store message in Firestore
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

    // Update conversation
    const conversationRef = CONVERSATIONS_COLLECTION.doc(conversationId || `conv_${phoneNumber}`);
    const conversationDoc = await conversationRef.get();

    if (conversationDoc.exists) {
      await conversationRef.update({
        'contact.lastMessage': message,
        'contact.lastMessageTime': now,
        updatedAt: now,
      });
    } else {
      // Create new conversation if doesn't exist
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

    // Mark conversation as read
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

// Export the webhook HTTP function
export const webhook = functions.https.onRequest(app);

/**
 * Firestore trigger: Notify on new incoming message
 */
export const onNewMessage = functions.firestore
  .document('whatsapp_messages/{messageId}')
  .onCreate(async (snap) => {
    const message = snap.data();

    // Only notify for incoming messages
    if (!message.isIncoming) return;

    // This could be extended to send push notifications, email alerts, etc.
    console.log(`New incoming message from ${message.senderName}: ${message.content}`);
  });

/**
 * Scheduled function to sync message statuses (optional)
 */
export const syncMessageStatuses = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    try {
      // Check for outgoing messages with 'sent' status in the last 24 hours
      // Note: Simplified query to avoid complex composite index requirements
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
