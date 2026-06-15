import * as admin from 'firebase-admin';
import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  VERIFY_TOKEN,
  CONVERSATIONS_COLLECTION,
  MESSAGES_COLLECTION,
  messaging,
} from './config';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

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

    if (body.object !== 'whatsapp_business_account') {
      return res.sendStatus(404);
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        if (value.messages && value.messages.length > 0) {
          for (const message of value.messages) {
            await processIncomingMessage(message, value.contacts?.[0], value.metadata);
          }
        }

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

  const conversationId = `conv_${phoneNumber}`;
  const conversationRef = CONVERSATIONS_COLLECTION.doc(conversationId);
  const conversationDoc = await conversationRef.get();

  const now = admin.firestore.Timestamp.now();

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
    rawPayload: message,
  };

  await MESSAGES_COLLECTION.add(messageData);

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
  const statusValue = status.status;

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

export default app;
