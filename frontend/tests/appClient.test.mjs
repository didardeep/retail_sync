// The Android app is for auditors only, and an expired login must send the person
// back to sign in. The server is the real boundary for the first (see
// backend/tests/test_auditor_app.py); these cover the app's own side.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  APP_CLIENT_HEADER, AUDITOR_APP, allowedInThisApp, appHeaders, isAuditorApp,
} from '../src/lib/appClient.js';
import {
  SESSION_EXPIRED_EVENT, announceExpiredSession, isSessionExpiry, shouldResume, whoExpired,
} from '../src/lib/sessionExpiry.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the app marks its requests, the website does not', () => {
  assert.deepEqual(appHeaders(true), { [APP_CLIENT_HEADER]: AUDITOR_APP });
  assert.deepEqual(appHeaders(false), {});
});

test('only auditors may stay signed in inside the app; everyone on the website', () => {
  assert.equal(allowedInThisApp('AUDITOR', true), true);
  for (const role of ['AUDIT_MANAGER', 'ADMIN', 'STORE_MANAGER', 'AUDITEE', 'CLUSTER_HEAD', 'HO_OPERATIONS', undefined]) {
    assert.equal(allowedInThisApp(role, true), false, String(role));
    assert.equal(allowedInThisApp(role, false), true, `${role} on the website`);
  }
});

test('the app is detected from Capacitor, and plain browsers are not the app', () => {
  assert.equal(isAuditorApp(), false); // no window in node
  globalThis.window = { Capacitor: { isNativePlatform: () => true } };
  try {
    assert.equal(isAuditorApp(), true);
    assert.deepEqual(appHeaders(), { [APP_CLIENT_HEADER]: AUDITOR_APP });
    globalThis.window = { Capacitor: { isNativePlatform: () => false } };
    assert.equal(isAuditorApp(), false);
  } finally {
    delete globalThis.window;
  }
});

test('only a 401 on a request that carried a token counts as an expired login', () => {
  assert.equal(isSessionExpiry(401, 'Bearer x', '/issues'), true);
  assert.equal(isSessionExpiry(401, undefined, '/issues'), false, 'no token sent');
  assert.equal(isSessionExpiry(401, 'Bearer x', '/auth/login'), false, 'wrong password');
  for (const status of [200, 403, 404, 500]) assert.equal(isSessionExpiry(status, 'Bearer x', '/issues'), false, String(status));
});

test('an expired login is announced as an event the app listens for', () => {
  const target = new EventTarget();
  let heard = 0;
  target.addEventListener(SESSION_EXPIRED_EVENT, () => { heard += 1; });
  announceExpiredSession(target);
  assert.equal(heard, 1);
  assert.doesNotThrow(() => announceExpiredSession(undefined)); // no window: nothing to tell
});

test('several expiry events in a row still remember who was signed in', () => {
  let who = null;
  who = whoExpired(who, 'u1'); // the first event finds the session
  who = whoExpired(who, undefined); // later events find nothing
  who = whoExpired(who, undefined);
  assert.equal(who, 'u1');
  assert.equal(whoExpired(null, undefined), null);
});

test('after an expiry only the same person resumes; anyone else starts at home', () => {
  assert.equal(shouldResume('u1', 'u1'), true);
  assert.equal(shouldResume('u1', 'u2'), false);
  assert.equal(shouldResume(null, 'u1'), false, 'a plain sign-in always starts at home');
});

test('the pieces are wired in: every request is marked and checked, the app listens, the assistant is hidden', () => {
  const client = read('../src/api/client.js');
  assert.match(client, /appHeaders\(\)/);
  assert.match(client, /isSessionExpiry\(res\.status/);
  const app = read('../src/App.jsx');
  assert.match(app, /SESSION_EXPIRED_EVENT/);
  assert.match(app, /allowedInThisApp/);
  const layout = read('../src/components/Layout.jsx');
  assert.match(layout, /!isAuditorApp\(\)[^\n]*<ChatAssistant/);
});
