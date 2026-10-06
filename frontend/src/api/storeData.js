// API calls for the Compliance Metrics page. Kept out of client.js so this
// work does not collide with other tracks editing that file. Every call takes
// an optional store id (admin / audit manager can narrow to one store).
import { request } from './client'

const byStore = (storeId) => (storeId ? `?store_id=${encodeURIComponent(storeId)}` : '')

export const storeDataApi = {
  cashReconciliations: (storeId) => request('/cash-reconciliations' + byStore(storeId)),
  cashDepositPickups: (storeId) => request('/cash-deposit-pickups' + byStore(storeId)),
  expiredInventory: (storeId) => request('/expired-inventory' + byStore(storeId)),
}
