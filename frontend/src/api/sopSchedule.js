// API calls for scheduling audits. SOP audits go through /sop-schedule; classic
// (checklist) audits reuse /audits, which has the same create / patch / cancel
// shape, so the Scheduling page can treat both kinds alike.
import { api, request } from './client'

function query(params) {
  const parts = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

export const sopScheduleApi = {
  create: (body) => request('/sop-schedule', { method: 'POST', body }),
  patch: (id, body) => request(`/sop-schedule/${id}`, { method: 'PATCH', body }),
  cancel: (id) => request(`/sop-schedule/${id}/cancel`, { method: 'POST' }),
  // Resolves to { conflict: null | { error, audit_id, kind } }.
  conflicts: ({ auditorId, date, storeId, excludeId, kind } = {}) =>
    request('/sop-schedule/conflicts' + query({
      auditor_id: auditorId,
      date,
      store_id: storeId,
      ...(kind === 'legacy' ? { exclude_audit_id: excludeId } : { exclude_sop_id: excludeId }),
    })),
}

export const legacyScheduleApi = {
  patch: (id, body) => request(`/audits/${id}`, { method: 'PATCH', body }),
  cancel: (id) => request(`/audits/${id}/cancel`, { method: 'POST' }),
}

// Create, patch or cancel by row kind ('legacy' or 'sop').
export const scheduleApiFor = (kind) => (kind === 'sop' ? sopScheduleApi : legacyScheduleApi)

// The two lists the Scheduling and Audit pages merge.
export async function fetchAuditRows() {
  return Promise.all([api.audits(), api.sopAudits()])
}
