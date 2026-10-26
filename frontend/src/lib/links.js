// URL contract: every cross-page link in the app is built here so pages agree
// on paths and query keys. See docs/URL_Contract.md for who reads each key.
//
//   /audits?stage&status&view&brand&store&region&auditor&q&id   (the Audit page)
//   /audits/:id                  (run or view one audit)
//   /audits/:id/review           (review screen)
//   /audits?stage&auditor&id&new=1   (/scheduling redirects here; new opens the schedule form)
//   /issues?status&priority&store&audit&id
//   /stores?region&format&id
//   /dashboard?store              (one store's view)
//   /questions?tab=...
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

export function auditsLink({ stage, status, brand, store, region, id } = {}) {
  return buildLink('/audits', { stage, status, brand, store, region, id })
}

// Scheduling lives on the Audit page; `open` opens the schedule form.
export function schedulingLink({ stage, auditor, id, open } = {}) {
  return buildLink('/audits', { stage, auditor, id, new: open ? '1' : undefined })
}

export function issuesLink({ status, priority, store, audit, id } = {}) {
  return buildLink('/issues', { status, priority, store, audit, id })
}

export function storesLink({ region, format, id } = {}) {
  return buildLink('/stores', { region, format, id })
}

export function questionsLink({ tab } = {}) {
  return buildLink('/questions', { tab })
}

// Managers land on the Dashboard store view (?store=<id>); everyone else on
// the audit list for that store.
export function storeScorecardLink(storeId, role) {
  if (role === 'AUDIT_MANAGER' || role === 'ADMIN') return buildLink('/dashboard', { store: storeId })
  return auditsLink({ store: storeId })
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
    case 'question':
      return questionsLink()
    default:
      // data_import and others have no page of their own.
      return null
  }
}
