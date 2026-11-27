// Question bank calls (edit, approve, deactivate). Kept out of client.js
// so this change does not collide with other tracks editing that file.
import { request } from './client'

export const questionsApi = {
  create: (body) => request('/questions', { method: 'POST', body }),
  edit: (id, body) => request(`/questions/${id}`, { method: 'PUT', body }),
  // Rejecting needs a reason (the API refuses REJECTED without one).
  approve: (id, decision, reason = '') =>
    request(`/questions/${id}/approve`, { method: 'POST', body: { decision, reason } }),
  deactivate: (id) => request(`/questions/${id}`, { method: 'DELETE' }),
  // Version history (managers only).
  versions: (code) => request(`/questions/${encodeURIComponent(code)}/versions`),
  changes: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
    return request('/questions/changes' + (q ? `?${q}` : ''))
  },
  versionAudits: (id) => request(`/questions/${id}/audits`),
  restore: (id, change_note = '') =>
    request(`/questions/${id}/restore`, { method: 'POST', body: { change_note } }),
}
