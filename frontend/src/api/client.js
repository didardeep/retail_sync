const BASE = import.meta.env.VITE_API_BASE || '/api'
const SESSION_KEY = 'rs_session'

// The session lives in localStorage (not sessionStorage) so the mobile app
// can be killed and reopened without losing the login -- an auditor working
// offline must be able to get back to their unsynced audits. The JWT itself
// still expires server-side after 12 hours.
export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null
  } catch {
    return null
  }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

function authHeaders() {
  const session = loadSession()
  return session?.token ? { Authorization: `Bearer ${session.token}` } : {}
}

// Errors carry the HTTP status and parsed body so callers (the offline sync
// layer in particular) can tell "offline" from "rejected" from "logged out".
async function throwFor(res, fallback) {
  const detail = await res.json().catch(() => ({}))
  const err = new Error(detail.error || `${fallback} (${res.status})`)
  err.status = res.status
  err.detail = detail
  throw err
}

async function send(path, options) {
  try {
    return await fetch(BASE + path, options)
  } catch {
    const err = new Error('You appear to be offline')
    err.offline = true
    throw err
  }
}

export async function request(path, { method = 'GET', body } = {}) {
  const res = await send(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) await throwFor(res, 'Request failed')
  return res.status === 204 ? null : res.json()
}

export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: { email, password } }),
  dashboard: () => request('/dashboard'),
  stores: (q = '') => request('/stores' + q),
  users: (role) => request('/users' + (role ? `?role=${role}` : '')),
  questions: (q = '') => request('/questions' + q),
  createQuestion: (body) => request('/questions', { method: 'POST', body }),
  approveQuestion: (id, decision) =>
    request(`/questions/${id}/approve`, { method: 'POST', body: { decision } }),
  checklists: () => request('/checklists'),
  audits: (q = '') => request('/audits' + q),
  audit: (id) => request(`/audits/${id}`),
  scheduleAudit: (body) => request('/audits', { method: 'POST', body }),
  answer: (auditId, respId, body) =>
    request(`/audits/${auditId}/responses/${respId}`, { method: 'PUT', body }),
  submitAudit: (id) => request(`/audits/${id}/submit`, { method: 'POST' }),
  updateAudit: (id, body) => request(`/audits/${id}`, { method: 'PATCH', body }),
  approveAudit: (id, body = {}) =>
    request(`/audits/${id}/approve`, { method: 'POST', body }),
  rateAudit: (id, body) => request(`/audits/${id}/rating`, { method: 'POST', body }),
  issues: (q = '') => request('/issues' + q),
  updateIssue: (id, body) => request(`/issues/${id}`, { method: 'PUT', body }),
  availability: () => request('/availability'),
  addAvailability: (body) => request('/availability', { method: 'POST', body }),
  // Observations
  observations: (q = '') => request('/observations' + q),
  createObservation: (body) => request('/observations', { method: 'POST', body }),
  updateObservation: (id, body) => request(`/observations/${id}`, { method: 'PUT', body }),
  // Audit log
  auditLogs: () => request('/audit-logs'),
  // Structured data endpoints
  dataImports: () => request('/data-imports'),
  storeScores: (q = '') => request('/store-scores' + q),
  // Brands (a store belongs to exactly one) and the per-brand score trend
  brands: () => request('/brands'),
  createBrand: (body) => request('/brands', { method: 'POST', body }),
  updateBrand: (id, body) => request(`/brands/${id}`, { method: 'PUT', body }),
  brandTrend: (q = '') => request('/dashboard/brand-trend' + q),
  // Auditees linked to a store, and the auditor's choice to raise an issue for one
  storeAuditees: (storeId) => request(`/stores/${storeId}/auditees`),
  raiseIssue: (auditId, respId, body) =>
    request(`/audits/${auditId}/responses/${respId}/issue`, { method: 'POST', body }),
  // CRUD
  createStore: (body) => request('/stores', { method: 'POST', body }),
  updateStore: (id, body) => request(`/stores/${id}`, { method: 'PUT', body }),
  createIssue: (body) => request('/issues', { method: 'POST', body }),
  // Admin — user management
  listUsers: (role) => request('/admin/users' + (role ? `?role=${role}` : '')),
  createUser: (body) => request('/admin/users', { method: 'POST', body }),
  updateUser: (id, body) => request(`/admin/users/${id}`, { method: 'PATCH', body }),
  // AI Chat
  chat: (messages, conversation_id) =>
    request('/chat', { method: 'POST', body: { messages, conversation_id } }),
  // File upload
  uploadFile: async (file, section) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('section', section)
    const res = await send('/upload', { method: 'POST', headers: authHeaders(), body: fd })
    if (!res.ok) await throwFor(res, 'Upload failed')
    return res.json()
  },
}
