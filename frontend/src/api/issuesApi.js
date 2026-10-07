// API calls for the Issues page. Kept out of client.js so this page does not
// edit the shared API file.
import { request } from './client'

export const issuesApi = {
  create: (body) => request('/issues', { method: 'POST', body }),
  update: (id, body) => request(`/issues/${id}`, { method: 'PUT', body }),
  remove: (id) => request(`/issues/${id}`, { method: 'DELETE' }),
}
