// Maps each backend role to the set of route "page" keys that role can
// access. AUDIT_MANAGER gets everything -- represented as null (no
// restriction). Keep these page keys in sync with the `page` prop on
// <RoleProtectedRoute> in App.jsx and the `page` key on each nav item in
// Layout.jsx.
//
// Derived from what backend/app/routers/*.py actually enforces per route
// (see require_roles(...) calls), not a new design decision:
//   - dashboard, scheduling, stores, questions-management are AUDIT_MANAGER-only
//     (dashboard.py, audits.schedule_audit, stores.create/update, questions.approve/edit)
//   - AUDITOR's core surface is their own audits + proposing/viewing questions
//     (audits.py filters to auditor_id == self; questions.list filters to APPROVED)
//   - STORE_MANAGER's core surface is issues assigned to them + rating their
//     store's audits (issues.py filters to assignee_id == self;
//     audits.store_manager_rating is STORE_MANAGER-only)
//   - "email" has no backend endpoint (UI-only demo page) -- open to all roles
export const ROLE_PAGES = {
  AUDIT_MANAGER: null,
  AUDITOR: ['audits', 'questions', 'email'],
  STORE_MANAGER: ['issues', 'audits', 'email'],
}

// 'audit-log' is deliberately absent from AUDITOR/STORE_MANAGER's lists above
// (not just this map) -- GET /api/audit-logs is AUDIT_MANAGER-only server-side.

export function canAccess(role, page) {
  const allowed = ROLE_PAGES[role]
  if (allowed === null) return true
  if (!allowed) return false
  return allowed.includes(page)
}

export function firstAllowedPage(role) {
  const allowed = ROLE_PAGES[role]
  if (allowed === null) return 'dashboard'
  return allowed?.[0] || 'email'
}
