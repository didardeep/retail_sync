// Store create/update calls for the Store Management page. Kept out of client.js
// so this change does not collide with other tracks editing that file.
import { request } from './client'

export const storesApi = {
  create: (body) => request('/stores', { method: 'POST', body }),
  update: (id, body) => request(`/stores/${id}`, { method: 'PUT', body }),
}
