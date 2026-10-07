// Maps each backend role to the set of route "page" keys that role can
// access. ADMIN/AUDIT_MANAGER get null (no restriction). Keep these page
// keys in sync with the `page` prop on <RoleProtectedRoute> in App.jsx
// and the `page` key on each nav item in lib/nav.js (NAV_ITEMS).
export const ROLE_PAGES = {
  ADMIN: null,            // sees everything
  AUDIT_MANAGER: null,    // sees everything except the ADMIN-only pages below
  AUDITOR: ['sop-audits', 'audits', 'questions', 'email'],
  STORE_MANAGER: ['my-store', 'checklist', 'compliance', 'issues', 'audits', 'sop-audits', 'email'],
}

// 'audit-log', 'scheduling', 'stores', 'scores', 'dashboard'
// are ADMIN/AUDIT_MANAGER-only (null catches them all).
// The user API is ADMIN-only, so these pages are ADMIN-only too.
const ADMIN_ONLY_PAGES = ['user-management']

export function canAccess(role, page) {
  if (ADMIN_ONLY_PAGES.includes(page)) return role === 'ADMIN'
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
