// API calls for rescheduling, cancelling and checking clashes on audits.
// Creating an audit is api.scheduleAudit in client.js.
import { request } from './client'

function query(params) {
  const parts = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

export const scheduleApi = {
  patch: (id, body) => request(`/audits/${id}`, { method: 'PATCH', body }),
  cancel: (id) => request(`/audits/${id}/cancel`, { method: 'POST' }),
  // Resolves to { conflict: null | { error, audit_id, store, scheduled_at } }.
  conflicts: ({ auditorId, date, storeId, excludeId } = {}) =>
    request('/audits/conflicts' + query({
      auditor_id: auditorId,
      date,
      store_id: storeId,
      exclude_audit_id: excludeId,
    })),
}
