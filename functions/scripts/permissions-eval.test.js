const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Regression tests for the direct-permission evaluator used by messaging
 * authorization paths (sendWhatsAppMessage, getConversations, getMessages).
 *
 * These pin the semantics against the compiled functions code so a future
 * refactor cannot silently change who can message.
 */

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-permissions-eval' });

const { evaluateUserPermission } = require('../lib/permissions');

const MESSAGER = {
  dms: { accessMode: 'custom', items: { whatsappMessenger: { actions: ['access', 'send'] } } },
};
const VIEWER_ONLY = {
  dms: { accessMode: 'custom', items: { whatsappMessenger: { actions: ['access'] } } },
};
const NO_DMS = { employees: { accessMode: 'full' } };

describe('evaluateUserPermission — messaging authorization semantics', () => {
  it('full module grants every action including send/manage', () => {
    const full = { dms: { accessMode: 'full' } };
    for (const action of ['access', 'send', 'manage']) {
      assert.equal(evaluateUserPermission(full, 'dms', 'whatsappMessenger', action), true);
    }
  });

  it('a stored access grant satisfies a view check and vice versa', () => {
    assert.equal(evaluateUserPermission(VIEWER_ONLY, 'dms', 'whatsappMessenger', 'access'), true);
    assert.equal(evaluateUserPermission(VIEWER_ONLY, 'dms', 'whatsappMessenger', 'view'), true);
  });

  it('access alone does not grant send or manage', () => {
    assert.equal(evaluateUserPermission(VIEWER_ONLY, 'dms', 'whatsappMessenger', 'send'), false);
    assert.equal(evaluateUserPermission(VIEWER_ONLY, 'dms', 'whatsappMessenger', 'manage'), false);
  });

  it('send-granted users can both read conversations and send', () => {
    assert.equal(evaluateUserPermission(MESSAGER, 'dms', 'whatsappMessenger', 'access'), true);
    assert.equal(evaluateUserPermission(MESSAGER, 'dms', 'whatsappMessenger', 'send'), true);
    assert.equal(evaluateUserPermission(MESSAGER, 'dms', 'whatsappMessenger', 'manage'), false);
  });

  it('users without dms are denied conversation access and send', () => {
    assert.equal(evaluateUserPermission(NO_DMS, 'dms', 'whatsappMessenger', 'access'), false);
    assert.equal(evaluateUserPermission(NO_DMS, 'dms', 'whatsappMessenger', 'send'), false);
  });

  it('missing or malformed permission trees deny safely', () => {
    for (const perms of [null, undefined, {}, { dms: {} }, { dms: { accessMode: 'custom' } }]) {
      assert.equal(evaluateUserPermission(perms, 'dms', 'whatsappMessenger', 'send'), false);
    }
  });
});
