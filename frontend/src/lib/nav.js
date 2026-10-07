// Single source of truth for the sidebar and the page title. `icon` is a key
// into NAV_ICONS (components/navIcons.jsx); `page` is the role-map page key.
export const NAV_ITEMS = [
  { path: '/my-store', page: 'my-store', label: 'My Store', title: 'My Store', icon: 'my-store', group: 'My store' },
  { path: '/checklist', page: 'checklist', label: 'Audit Checklist', title: 'Audit Checklist', icon: 'checklist', group: 'My store' },
  { path: '/compliance', page: 'compliance', label: 'Compliance Metrics', title: 'Compliance Metrics', icon: 'compliance', group: 'My store' },
  { path: '/my-dashboard', page: 'my-dashboard', label: 'Dashboard', title: 'Dashboard', icon: 'dashboard', group: 'Insights' },
  { path: '/dashboard', page: 'dashboard', label: 'Dashboard & Analytics', title: 'Dashboard & Analytics', icon: 'dashboard', group: 'Insights' },
  { path: '/audits', page: 'audits', label: 'Audit', title: 'Audit', icon: 'audits', group: 'Audits' },
  { path: '/scheduling', page: 'scheduling', label: 'Audit Scheduling', title: 'Audit Scheduling', icon: 'scheduling', group: 'Audits' },
  { path: '/scores', page: 'scores', label: 'Store Audit Scores', title: 'Store Audit Scores', icon: 'scores', group: 'Insights' },
  { path: '/issues', page: 'issues', label: 'Action Taken Tracking', title: 'Action Taken Tracking', icon: 'issues', group: 'Insights' },
  { path: '/questions', page: 'questions', label: 'Audit Questions', title: 'Audit Questions', icon: 'questions', group: 'Admin' },
  { path: '/stores', page: 'stores', label: 'Store Management', title: 'Store Management', icon: 'stores', group: 'Admin' },
  { path: '/email', page: 'email', label: 'Email Communications', title: 'Email Communications', icon: 'email', group: 'Admin' },
  { path: '/audit-log', page: 'audit-log', label: 'Audit Log', title: 'Audit Log', icon: 'audit-log', group: 'Admin' },
  { path: '/user-management', page: 'user-management', label: 'User Management', title: 'User Management', icon: 'user-management', group: 'Admin' },
]

const DEFAULT_TITLE = 'Store Audit and Analysis'

function titleOfPath(path) {
  return NAV_ITEMS.find((n) => n.path === path)?.title
}

export function titleFor(pathname) {
  const exact = titleOfPath(pathname)
  if (exact) return exact
  if (pathname.startsWith('/sop-audits')) return titleOfPath('/audits')
  if (pathname.startsWith('/questions/')) return titleOfPath('/questions')
  if (pathname.startsWith('/audits/')) return 'Audit'
  return DEFAULT_TITLE
}
