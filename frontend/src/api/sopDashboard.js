// API calls for the SOP tab of the dashboard (Track B). Kept out of client.js
// so this track and the review/workflow track do not edit the same file.
import { request } from './client'

export const sopDashboardApi = {
  load: () => request('/sop-dashboard'),
}
