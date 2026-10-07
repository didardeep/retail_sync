// URL contract: every cross-page link in the app is built here so pages agree
// on paths and query keys. See docs/URL_Contract.md for who reads each key.
//
//   /audits?stage&status&view&tool&kind&store&region&auditor&q&id   (the one Audit page)
//   /scheduling?stage&auditor&id&new=sop
//   /issues?status&priority&store&audit&sop_audit&id
//   /stores?region&format&id
//   /sop-audits?...            (old list URL: redirects to /audits with the same query)
//   /sop-audits/:id            (run the audit wizard)
//   /sop-audits/:id/review     (review screen)
//   /dashboard?store              (one store's view; ignored when tab=sop)
//   /dashboard?tab=sop&store&tool&section&criterion
//   /questions?tab=...
//   /questions/sop-tools/:code (SOP tool editor, manager only)
//
// Empty, null and undefined values are never put in the URL.

function buildLink(path, params = {}) {
  const parts = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  }
  return parts.length ? `${path}?${parts.join('&')}` : path
}

export function auditsLink({ stage, kind, store, region, id } = {}) {
  return buildLink('/audits', { stage, kind, store, region, id })
}

export function schedulingLink({ stage, auditor, id, newKind } = {}) {
  return buildLink('/scheduling', { stage, auditor, id, new: newKind })
}

export function issuesLink({ status, priority, store, audit, sop_audit, id } = {}) {
  return buildLink('/issues', { status, priority, store, audit, sop_audit, id })
}

export function storesLink({ region, format, id } = {}) {
  return buildLink('/stores', { region, format, id })
}

// The Audit page filtered the way the auditor dashboard and old links do:
// status (scheduled, in_progress, completed, cancelled, overdue or a raw
// status such as Planned/Draft/Submitted), store, tool (SOP tool code), view.
export function sopAuditsLink({ store, tool, status, view } = {}) {
  return buildLink('/audits', { store, tool, status, view })
}

// Where an old /sop-audits list URL goes: /audits with the query kept as is.
export function auditListRedirectTarget(search = '') {
  const q = search.startsWith('?') ? search.slice(1) : search
  return q ? `/audits?${q}` : '/audits'
}

export function sopDashboardLink({ store, tool, section, criterion } = {}) {
  return buildLink('/dashboard', { tab: 'sop', store, tool, section, criterion })
}

export function sopAuditReviewLink(id) {
  return `/sop-audits/${encodeURIComponent(id)}/review`
}

export function sopAuditRunLink(id) {
  return `/sop-audits/${encodeURIComponent(id)}`
}

export function questionsLink({ tab } = {}) {
  return buildLink('/questions', { tab })
}

export function sopToolEditorLink(code) {
  return `/questions/sop-tools/${encodeURIComponent(code)}`
}

// Managers land on the Dashboard store view (?store=<id>); everyone else on
// the SOP audit list for that store.
export function storeScorecardLink(storeId, role) {
  if (role === 'AUDIT_MANAGER' || role === 'ADMIN') return buildLink('/dashboard', { store: storeId })
  return sopAuditsLink({ store: storeId })
}

// Maps an audit-log entity_type/entity_id to a page, or null when there is none.
export function entityLink(entityType, entityId) {
  if (!entityId) return null
  switch (entityType) {
    case 'store':
      return storesLink({ id: entityId })
    case 'audit':
      return auditsLink({ id: entityId })
    case 'issue':
      return issuesLink({ id: entityId })
    case 'sop_audit':
      return sopAuditReviewLink(entityId)
    case 'question':
      return questionsLink()
    default:
      // data_import, sop_criterion and others have no page of their own.
      return null
  }
}
