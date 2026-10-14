/**
 * Post-deployment authenticated smoke tests for the direct-permission RBAC.
 *
 * Mints custom tokens via the Admin SDK, exchanges them for ID tokens, and
 * exercises production rules (Firestore REST) plus deployed callable/HTTP
 * functions as a Director, HR, and Branch Manager.
 *
 * Design notes:
 *   - Allow-path tests prefer no-op writes (same field value) or probe
 *     documents that are cleaned up afterwards; deny tests never write.
 *   - The in-branch shift-assignment test performs add -> remove, restoring
 *     the shift document to its prior state.
 *   - sendWhatsAppMessage is only probed up to the validation boundary so no
 *     real WhatsApp message is sent.
 *
 * Usage from functions/: node scripts/smoke-authz.js
 */

const admin = require('firebase-admin');
const adminAuth = require('./lib/adminAuth');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT = 'allmed-hrms';
const REGION = 'us-central1';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = (name) => `https://${REGION}-${PROJECT}.cloudfunctions.net/${name}`;

const ACCOUNTS = {
  director: 'san9pUX1WJe5PF9b0Xuiymog87t2', // Shalom
  hr: 'WWyLvMf75ATJfo67X3oz9dGPcap2', // Anusree
  bm: 'D8Mvn1VAJAcp6UOAacv34Ol8ycY2', // Koothattukulam
};

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, status: pass === null ? 'NOT RUN' : pass ? 'PASS' : 'FAIL', detail });
  console.log(`${pass === null ? 'NOT RUN' : pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function initAdmin() {
  adminAuth.initAdmin('smoke-authz-adc.json');
  // serviceAccountId lets user (ADC) credentials mint custom tokens via IAM
  // signBlob instead of a local service-account key. Requires the caller's
  // account to hold roles/iam.serviceAccountTokenCreator on this SA.
  admin.initializeApp({ projectId: PROJECT, serviceAccountId: 'firebase-adminsdk-fbsvc@allmed-hrms.iam.gserviceaccount.com' });
}

const rootRequire = require('node:module').createRequire(path.join(__dirname, '..', '..', 'package.json'));
const { initializeApp: initClient } = rootRequire('firebase/app');
const { getAuth, signInWithCustomToken } = rootRequire('firebase/auth');
const { getFunctions, httpsCallable } = rootRequire('firebase/functions');

function envVar(name) {
  const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from .env`);
  return line.split('=')[1].trim();
}

const firebaseConfig = {
  apiKey: envVar('VITE_FIREBASE_API_KEY'),
  authDomain: envVar('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: envVar('VITE_FIREBASE_PROJECT_ID'),
  appId: envVar('VITE_FIREBASE_APP_ID'),
};

/** Signs a user in with a custom token and returns { idToken, call(name, data) }. */
async function sessionFor(label, uid) {
  const custom = await admin.auth().createCustomToken(uid);
  const app = initClient(firebaseConfig, `smoke-${label}`);
  const cred = await signInWithCustomToken(getAuth(app), custom);
  const token = await cred.user.getIdToken();
  const fns = getFunctions(app, REGION);
  const call = async (name, data) => {
    try {
      const res = await httpsCallable(fns, name)(data);
      return { http: 200, result: true, body: { result: res.data }, errorStatus: undefined };
    } catch (error) {
      const code = typeof error.code === 'string' ? error.code.replace(/^functions\//, '').toUpperCase().replace(/-/g, '_') : 'UNKNOWN';
      return { http: 400, result: false, body: { error: { status: code } }, errorStatus: code };
    }
  };
  return { idToken: token, call };
}

// ---- Firestore REST helpers (evaluated by security rules) ----
const enc = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
};

async function fsWrite(token, method, docPath, fields, mask) {
  const url = `${FS}/${docPath}${mask ? `?updateMask.fieldPaths=${mask.map(encodeURIComponent).join('&updateMask.fieldPaths=')}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: fields ? JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, enc(v)])) }) : undefined,
  });
  return res.status;
}

const fsCreate = (t, path, fields) => fsWrite(t, 'POST', `${path.split('/').slice(0, -1).join('/')}?documentId=${path.split('/').pop()}`, fields);
const fsPatch = (t, path, fields, mask) => fsWrite(t, 'PATCH', path, fields, mask);
const fsDelete = (t, path) => fsWrite(t, 'DELETE', path);

async function httpPost(token, name, body) {
  const res = await fetch(FN(name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { http: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  initAdmin();
  const db = admin.firestore();

  // Resolve live branch data for the BM scope tests.
  const branches = await db.collection('branches').get();
  const bmBranch = branches.docs.find((d) => d.data().managerId === ACCOUNTS.bm);
  const otherBranch = branches.docs.find((d) => d.data().managerId !== ACCOUNTS.bm);
  const bmEmp = bmBranch.data().employeeIds[0];
  const bmShift = bmBranch.data().shiftIds[0];
  const otherEmp = otherBranch.data().employeeIds[0];
  const otherShift = otherBranch.data().shiftIds[0];

  const tokens = {};
  const calls = {};
  for (const [role, uid] of Object.entries(ACCOUNTS)) {
    const session = await sessionFor(role, uid);
    tokens[role] = session.idToken;
    calls[role] = session.call;
  }
  const callFn = async (role, name, data) => calls[role](name, data);
  const hrUid = ACCOUNTS.hr;
  const probe = `smoke-probe-${Date.now()}`;
  const leftovers = [];

  console.log('=== DIRECTOR ===');
  // 1. Edit another user's permissions — write a different tree then restore
  //    the original; both writes must succeed and net change is zero.
  const hrDoc = await db.collection('users').doc(hrUid).get();
  const hrPerms = hrDoc.data().permissions;
  const mutatedPerms = { ...hrPerms, devices: { accessMode: 'custom', items: { devices: { actions: ['view'] } } } };
  const permWrite = await fsPatch(tokens.director, `users/${hrUid}`, { permissions: mutatedPerms }, ['permissions']);
  const permRestore = await fsPatch(tokens.director, `users/${hrUid}`, { permissions: hrPerms }, ['permissions']);
  if (permWrite === 200 && permRestore !== 200) {
    await db.collection('users').doc(hrUid).update({ permissions: hrPerms });
  }
  record('Director can edit another user\'s permissions (write + restore)', permWrite === 200 && permRestore === 200, `write=${permWrite} restore=${permRestore}`);

  // 2. Create + delete a probe user document.
  const createUser = await fsCreate(tokens.director, `users/${probe}`, { name: 'smoke-probe', roleId: 'whatsapp-messager', designation: 'WhatsApp Messager' });
  const delUser = await fsDelete(tokens.director, `users/${probe}`);
  record('Director can create a user document', createUser === 200 && delUser === 200, `create=${createUser} delete=${delUser}`);

  // 3. Write a role document — no-op write (same name) proves write authority.
  const roleDoc = await db.collection('roles').doc('hr').get();
  const roleWrite = await fsPatch(tokens.director, 'roles/hr', { name: roleDoc.data().name }, ['name']);
  record('Director can write a role document', roleWrite === 200, `HTTP ${roleWrite}`);

  // 4. Authorized employee create + delete via probe doc.
  const empCreate = await fsCreate(tokens.director, `employees/${probe}`, { employeeName: 'smoke-probe', employeeCode: 'SMOKE-1' });
  const empDelete = await fsDelete(tokens.director, `employees/${probe}`);
  record('Director can create/delete an employee', empCreate === 200 && empDelete === 200, `create=${empCreate} delete=${empDelete}`);

  // 5. Authorized shift-assignment delete path — nonexistent employee reaches not-found (NOT permission-denied).
  const delAssign = await callFn('director', 'removeExistingShiftAssignment', { employeeId: 'smoke-nonexistent-employee', shiftId: 'x', assignmentId: 'y' });
  record('Director authorized for shift-assignment delete', delAssign.errorStatus === 'NOT_FOUND', `status=${delAssign.errorStatus}`);

  console.log('\n=== HR ===');
  // Employees full: create, update, delete probe.
  const hrEmpCreate = await fsCreate(tokens.hr, `employees/${probe}`, { employeeName: 'smoke-probe', employeeCode: 'SMOKE-1' });
  const hrEmpEdit = await fsPatch(tokens.hr, `employees/${probe}`, { employeeName: 'smoke-probe-2' }, ['employeeName']);
  const hrEmpDelete = await fsDelete(tokens.hr, `employees/${probe}`);
  record('HR can add/edit/delete employees', hrEmpCreate === 200 && hrEmpEdit === 200 && hrEmpDelete === 200, `create=${hrEmpCreate} edit=${hrEmpEdit} delete=${hrEmpDelete}`);

  // Edit another user's name — no-op (same value) proves userManagement.edit.
  const bmUserDoc = await db.collection('users').doc(ACCOUNTS.bm).get();
  const hrNameEdit = await fsPatch(tokens.hr, `users/${ACCOUNTS.bm}`, { name: bmUserDoc.data().name }, ['name']);
  record('HR can edit another user\'s name', hrNameEdit === 200, `HTTP ${hrNameEdit}`);

  // Role/permission changes must be denied for HR. A DIFFERENT permissions
  // value is sent so diff().affectedKeys() actually contains 'permissions';
  // a denial writes nothing.
  const hrRoleChange = await fsPatch(tokens.hr, `users/${ACCOUNTS.bm}`, { roleId: 'director' }, ['roleId']);
  const hrPermChange = await fsPatch(tokens.hr, `users/${ACCOUNTS.bm}`, { permissions: { employees: { accessMode: 'full' } } }, ['permissions']);
  record('HR cannot change another user\'s roleId', hrRoleChange === 403, `HTTP ${hrRoleChange}`);
  record('HR cannot change another user\'s permissions', hrPermChange === 403, `HTTP ${hrPermChange}`);

  const hrRoleWrite = await fsPatch(tokens.hr, 'roles/hr', { name: roleDoc.data().name }, ['name']);
  record('HR cannot write role documents', hrRoleWrite === 403, `HTTP ${hrRoleWrite}`);

  console.log('\n=== BRANCH MANAGER ===');
  const empDoc = await db.collection('employees').doc(bmEmp).get();
  const bmEmpEdit = await fsPatch(tokens.bm, `employees/${bmEmp}`, { employmentStatus: empDoc.data().employmentStatus ?? 'active' }, ['employmentStatus']);
  record('BM can edit an employee (no-op write)', bmEmpEdit === 200, `HTTP ${bmEmpEdit}`);

  const bmEmpCreate = await fsCreate(tokens.bm, `employees/${probe}`, { employeeName: 'smoke-probe', employeeCode: 'SMOKE-1' });
  record('BM cannot create an employee (no add permission)', bmEmpCreate === 403, `HTTP ${bmEmpCreate}`);

  // Own-branch leave create allowed; clean up probe afterwards via admin.
  const ownLeave = await fsCreate(tokens.bm, `leaves/${probe}`, { branchId: bmBranch.id, employeeId: bmEmp, type: 'leave', status: 'pending' });
  record('BM can create a leave within own branch', ownLeave === 200, `HTTP ${ownLeave}`);
  if (ownLeave === 200) leftovers.push(`leaves/${probe}`);

  const otherLeave = await fsCreate(tokens.bm, `leaves/${probe}-x`, { branchId: otherBranch.id, employeeId: otherEmp, type: 'leave', status: 'pending' });
  record('BM cannot create a leave outside own branch', otherLeave === 403, `HTTP ${otherLeave}`);
  if (otherLeave === 200) leftovers.push(`leaves/${probe}-x`);

  const shiftDoc = await db.collection('shifts').doc(bmShift).get();
  const bmRoster = await fsPatch(tokens.bm, `shifts/${bmShift}`, { employees: [] }, ['employees']);
  record('BM cannot mutate shifts[].employees directly', bmRoster === 403, `HTTP ${bmRoster}`);
  const bmShiftEdit = await fsPatch(tokens.bm, `shifts/${bmShift}`, { startTime: shiftDoc.data().startTime }, ['startTime']);
  record('BM can edit non-roster shift fields', bmShiftEdit === 200, `HTTP ${bmShiftEdit}`);

  // In-branch assignment: add then remove to restore prior state.
  const add = await callFn('bm', 'addExistingShiftAssignment', { employeeId: bmEmp, shiftId: bmShift, fromDate: '2027-12-25', toDate: '2027-12-25' });
  if (add.result && add.body.result && add.body.result.assignmentId) {
    const remove = await callFn('bm', 'removeExistingShiftAssignment', { employeeId: bmEmp, shiftId: bmShift, assignmentId: add.body.result.assignmentId });
    record('BM in-branch shift assignment add/remove', remove.result === true, `added + removed=${JSON.stringify(remove.body)}`);
  } else {
    // already-exists/not-found still proves permission + scope passed.
    record('BM in-branch shift assignment authorized', add.errorStatus !== 'PERMISSION_DENIED' && add.errorStatus !== 'UNAUTHENTICATED', `status=${add.errorStatus || 'result'}`);
  }
  const outAdd = await callFn('bm', 'addExistingShiftAssignment', { employeeId: otherEmp, shiftId: otherShift, fromDate: '2027-12-26', toDate: '2027-12-26' });
  record('BM out-of-branch shift assignment denied', outAdd.errorStatus === 'PERMISSION_DENIED', `status=${outAdd.errorStatus}`);

  const bmUsersWrite = await fsPatch(tokens.bm, `users/${hrUid}`, { name: 'x' }, ['name']);
  record('BM cannot write Users documents', bmUsersWrite === 403, `HTTP ${bmUsersWrite}`);

  console.log('\n=== CROSS-CUTTING ===');
  const bmSelfPerm = await fsPatch(tokens.bm, `users/${ACCOUNTS.bm}`, { permissions: { employees: { accessMode: 'full' } } }, ['permissions']);
  record('User cannot modify own permissions (BM)', bmSelfPerm === 403, `HTTP ${bmSelfPerm}`);
  const hrSelfRole = await fsPatch(tokens.hr, `users/${hrUid}`, { roleId: 'director' }, ['roleId']);
  record('User cannot change own roleId (HR)', hrSelfRole === 403, `HTTP ${hrSelfRole}`);

  const bmConv = await callFn('bm', 'getConversations', {});
  record('BM denied DMS conversations (no dms permission)', bmConv.errorStatus === 'PERMISSION_DENIED', `status=${bmConv.errorStatus}`);
  const dirConv = await callFn('director', 'getConversations', {});
  record('Director allowed DMS conversations', dirConv.result === true || dirConv.http === 200, `http=${dirConv.http} status=${dirConv.errorStatus || 'ok'}`);

  const bmWa = await httpPost(tokens.bm, 'sendWhatsAppMessage', { phoneNumber: '0', message: 'x' });
  record('BM denied WhatsApp send', bmWa.http === 403 && bmWa.json.error === 'permission-denied', `HTTP ${bmWa.http} ${bmWa.json.error || ''}`);
  const dirWa = await httpPost(tokens.director, 'sendWhatsAppMessage', {});
  record('Director WhatsApp send reaches validation (authorized, no message sent)', dirWa.http === 400, `HTTP ${dirWa.http} ${dirWa.json.error || ''}`);

  const hook = await fetch(`${FN('webhook')}?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=probe`);
  record('Webhook rejects bad Meta verify token', hook.status === 403, `HTTP ${hook.status}`);

  // Divergence within one role requires two same-role users with different trees;
  // all 8 production BMs currently share an identical tree — covered by emulator tests.
  record('Same-role users with different trees diverge', null, 'all production BMs share one permission tree; covered by emulator rules tests');

  // Clean up any probe documents the deny-tests unexpectedly created.
  for (const p of leftovers) {
    await db.doc(p).delete();
    console.log(`cleaned up probe doc: ${p}`);
  }

  const failed = results.filter((r) => r.status === 'FAIL');
  console.log(`\n=== SUMMARY: ${results.filter((r) => r.status === 'PASS').length} PASS, ${failed.length} FAIL, ${results.filter((r) => r.status === 'NOT RUN').length} NOT RUN ===`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error('Smoke run failed:', e); process.exit(1); });
