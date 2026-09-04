const BASE = import.meta.env.VITE_API_BASE || '/api'
const SESSION_KEY = 'rs_session'

export function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null
  } catch {
    return null
  }
}

export function saveSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}

async function request(path, { method = 'GET', body } = {}) {
  const session = loadSession()
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.error || `Request failed (${res.status})`)
  }
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
  approveAudit: (id, body = {}) =>
    request(`/audits/${id}/approve`, { method: 'POST', body }),
  rateAudit: (id, body) => request(`/audits/${id}/rating`, { method: 'POST', body }),
  issues: (q = '') => request('/issues' + q),
  updateIssue: (id, body) => request(`/issues/${id}`, { method: 'PUT', body }),
  availability: () => request('/availability'),
  addAvailability: (body) => request('/availability', { method: 'POST', body }),
}
