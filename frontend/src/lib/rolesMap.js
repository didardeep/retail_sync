// Maps each backend role to the set of route "page" keys that role can
// access. ADMIN/AUDIT_MANAGER get null (no restriction). Keep these page
// keys in sync with the `page` prop on <RoleProtectedRoute> in App.jsx
// and the `page` key on each nav item in lib/nav.js (NAV_ITEMS).
export const ROLE_PAGES = {
  ADMIN: null,            // sees everything
  AUDIT_MANAGER: null,    // sees everything
  AUDITOR: ['sop-audits', 'audits', 'questions', 'email'],
  STORE_MANAGER: ['my-store', 'checklist', 'compliance', 'issues', 'audits', 'sop-audits', 'email'],
}

// 'audit-log', 'scheduling', 'stores', 'scores', 'dashboard', 'user-management'
// are ADMIN/AUDIT_MANAGER-only (null catches them all).

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
