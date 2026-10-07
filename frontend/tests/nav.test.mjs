// Guards against a page losing its sidebar link (it happened once during a merge):
// every page a role can open must be reachable from the nav, and every guarded route must exist in it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { NAV_ITEMS, titleFor } from '../src/lib/nav.js';
import { ROLE_PAGES, canAccess, firstAllowedPage } from '../src/lib/rolesMap.js';

const pages = new Set(NAV_ITEMS.map((n) => n.page));

test('every page listed for a role has a sidebar entry', () => {
  for (const [role, list] of Object.entries(ROLE_PAGES)) {
    if (list === null) continue;
    for (const page of list) assert.ok(pages.has(page), `${role} can open "${page}" but it has no nav item`);
  }
});

test('every guarded route in App.jsx is in the nav (except nested editor routes)', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const keys = new Set([...app.matchAll(/guarded\('([a-z-]+)'/g)].map((m) => m[1]));
  keys.delete('sop-tools');                       // /questions/sop-tools/:code is reached from Audit Questions
  for (const key of keys) assert.ok(pages.has(key), `route "${key}" has no nav item`);
});

test('nav items are unique and well formed', () => {
  assert.equal(new Set(NAV_ITEMS.map((n) => n.path)).size, NAV_ITEMS.length);
  for (const n of NAV_ITEMS) {
    assert.ok(n.path.startsWith('/') && n.label && n.title && n.icon && n.group, JSON.stringify(n));
  }
});

test('each role lands on a page it can open', () => {
  for (const role of Object.keys(ROLE_PAGES)) {
    const first = firstAllowedPage(role);
    assert.ok(canAccess(role, first), `${role} lands on "${first}" but cannot open it`);
  }
  assert.equal(firstAllowedPage('AUDITOR'), 'my-dashboard');
});

test('titles resolve for nested and detail routes', () => {
  assert.equal(titleFor('/sop-audits/abc/review'), 'Audit');
  assert.equal(titleFor('/questions/sop-tools/CASH'), 'Audit Questions');
  assert.equal(titleFor('/audits/AUD-1001'), 'Audit');
  assert.equal(titleFor('/my-store'), 'My Store');
  assert.equal(titleFor('/nowhere'), 'Store Audit and Analysis');
});

test('user management is for ADMIN only (the user API refuses everyone else)', () => {
  assert.equal(canAccess('ADMIN', 'user-management'), true);
  for (const role of ['AUDIT_MANAGER', 'AUDITOR', 'STORE_MANAGER']) {
    assert.equal(canAccess(role, 'user-management'), false, role);
  }
  assert.equal(canAccess('AUDIT_MANAGER', 'stores'), true);
});

test('auditors cannot open Audit Questions (managers and admins only)', () => {
  assert.equal(canAccess('AUDITOR', 'questions'), false);
  assert.equal(canAccess('AUDIT_MANAGER', 'questions'), true);
  assert.equal(canAccess('ADMIN', 'questions'), true);
});

test('auditor sees Dashboard, Audit and Email only; managers do not get the auditor dashboard', () => {
  const auditorPages = NAV_ITEMS.filter((n) => canAccess('AUDITOR', n.page)).map((n) => n.label);
  assert.deepEqual(auditorPages, ['Dashboard', 'Audit', 'Email Communications']);
  assert.equal(canAccess('AUDIT_MANAGER', 'my-dashboard'), false);
  assert.equal(canAccess('ADMIN', 'my-dashboard'), false);
  assert.equal(canAccess('STORE_MANAGER', 'my-dashboard'), false);
});
