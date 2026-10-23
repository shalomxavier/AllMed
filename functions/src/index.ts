import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Initialize Firebase Admin
admin.initializeApp();

// Webhook HTTP function (Express app)
import webhookApp from './webhook';
export const webhook = functions.https.onRequest(webhookApp);

// WhatsApp send message
export { sendWhatsAppMessage } from './whatsapp';

// Conversation & message queries
export { getConversations, getMessages } from './conversations';

export {
  addExistingShiftAssignment,
  updateExistingShiftAssignment,
  removeExistingShiftAssignment,
  changeExistingShiftAssignmentForDate,
} from './shiftAssignments';
