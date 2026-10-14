const { describe, it, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');

/**
 * Rules tests for the WhatsApp collections lockdown.
 *
 * whatsapp_conversations: read for any authenticated user; updates limited to
 *   read-receipt/delivery-status fields for users holding dms.whatsappMessenger
 *   access; create/delete denied (webhook/send functions write via Admin SDK).
 * whatsapp_messages:      read-only for authenticated users.
 *
 * Run against the Firestore emulator:
 *   firebase emulators:exec --only firestore --project demo-allmed-whatsapp \
 *     "node --test functions/scripts/rules-whatsapp.test.js"
 */

const PROJECT_ID = 'demo-allmed-whatsapp';
const RULES = fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
const EMULATOR_AVAILABLE = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

const DMS_VIEWER = { dms: { accessMode: 'custom', items: { whatsappMessenger: { actions: ['access'] } } } };
const DMS_MANAGER = { dms: { accessMode: 'custom', items: { whatsappMessenger: { actions: ['access', 'send', 'manage'] } } } };
const NO_DMS = { employees: { accessMode: 'full' } };

let testEnv;
const dbFor = (uid) => testEnv.authenticatedContext(uid).firestore();

before(async () => {
  if (!EMULATOR_AVAILABLE) return;
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES },
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'viewer'), { name: 'Viewer', roleId: 'whatsapp-messager', designation: 'WhatsApp Messager', permissions: DMS_VIEWER });
    await setDoc(doc(db, 'users', 'manager'), { name: 'Manager', roleId: 'director', designation: 'Director', permissions: DMS_MANAGER });
    await setDoc(doc(db, 'users', 'staff'), { name: 'Staff', roleId: 'hr', designation: 'HR', permissions: NO_DMS });
    await setDoc(doc(db, 'users', 'noperm'), { name: 'NoPerms', roleId: 'hr', designation: 'HR' });
    await setDoc(doc(db, 'whatsapp_conversations', 'conv1'), {
      contact: { phoneNumber: '9199', unreadCount: 2, deliveryStatus: 'pending' },
      unreadCount: 2,
      isActive: true,
      businessPhoneNumberId: 'p1',
      updatedAt: new Date(),
    });
    await setDoc(doc(db, 'whatsapp_messages', 'm1'), { conversationId: 'conv1', content: 'hi', isIncoming: true });
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

describe('whatsapp_conversations / whatsapp_messages rules', { skip: !EMULATOR_AVAILABLE && 'requires the Firestore emulator' }, () => {
  it('authenticated users can still read conversations and messages', async () => {
    await assertSucceeds(getDoc(doc(dbFor('noperm'), 'whatsapp_conversations', 'conv1')));
    await assertSucceeds(getDoc(doc(dbFor('noperm'), 'whatsapp_messages', 'm1')));
  });

  it('a DMS user can mark a conversation read', async () => {
    await assertSucceeds(updateDoc(doc(dbFor('viewer'), 'whatsapp_conversations', 'conv1'), {
      'contact.unreadCount': 0,
      unreadCount: 0,
    }));
  });

  it('a DMS manager can update delivery status', async () => {
    await assertSucceeds(updateDoc(doc(dbFor('manager'), 'whatsapp_conversations', 'conv1'), {
      'contact.deliveryStatus': 'delivered',
      'contact.deliveryReason': 'ok',
      updatedAt: new Date(),
    }));
  });

  it('a user without DMS permission cannot update a conversation', async () => {
    await assertFails(updateDoc(doc(dbFor('staff'), 'whatsapp_conversations', 'conv1'), {
      'contact.unreadCount': 0,
    }));
  });

  it('even a DMS user cannot change other conversation fields', async () => {
    await assertFails(updateDoc(doc(dbFor('manager'), 'whatsapp_conversations', 'conv1'), {
      isActive: false,
    }));
    await assertFails(updateDoc(doc(dbFor('manager'), 'whatsapp_conversations', 'conv1'), {
      businessPhoneNumberId: 'other',
    }));
  });

  it('clients cannot create or delete conversations', async () => {
    await assertFails(setDoc(doc(dbFor('manager'), 'whatsapp_conversations', 'conv2'), { contact: {} }));
    await assertFails(deleteDoc(doc(dbFor('manager'), 'whatsapp_conversations', 'conv1')));
  });

  it('clients cannot write messages at all', async () => {
    await assertFails(setDoc(doc(dbFor('manager'), 'whatsapp_messages', 'm2'), { conversationId: 'conv1', content: 'x' }));
    await assertFails(updateDoc(doc(dbFor('manager'), 'whatsapp_messages', 'm1'), { status: 'read' }));
    await assertFails(deleteDoc(doc(dbFor('manager'), 'whatsapp_messages', 'm1')));
  });
});
