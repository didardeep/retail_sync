// Question bank calls (edit, approve, deactivate). Kept out of client.js
// so this change does not collide with other tracks editing that file.
import { request } from './client'

export const questionsApi = {
  create: (body) => request('/questions', { method: 'POST', body }),
  edit: (id, body) => request(`/questions/${id}`, { method: 'PUT', body }),
  approve: (id, decision) =>
    request(`/questions/${id}/approve`, { method: 'POST', body: { decision } }),
  deactivate: (id) => request(`/questions/${id}`, { method: 'DELETE' }),
}
