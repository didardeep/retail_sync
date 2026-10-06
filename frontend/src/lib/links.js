// URL contract: every cross-page link in the app is built here so pages agree
// on paths and query keys. See docs/URL_Contract.md for who reads each key.
//
//   /audits?stage&kind&store&region&id
//   /scheduling?stage&auditor&id&new=sop
//   /issues?status&priority&store&audit&sop_audit&id
//   /stores?region&format&id
//   /sop-audits?store&tool&status&view
//   /sop-audits/:id            (run the audit wizard)
//   /sop-audits/:id/review     (review screen)
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

export function sopAuditsLink({ store, tool, status, view } = {}) {
  return buildLink('/sop-audits', { store, tool, status, view })
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

// Managers land on the SOP dashboard filtered to the store; everyone else on
// the SOP audit list for that store.
export function storeScorecardLink(storeId, role) {
  if (role === 'AUDIT_MANAGER') return sopDashboardLink({ store: storeId })
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
