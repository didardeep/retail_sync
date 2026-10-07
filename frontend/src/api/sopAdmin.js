// API calls for SOP tool administration (versions, editor); manager only.
import { request } from './client'

export const sopAdminApi = {
  // Every tool with its current version, version history and audit counts.
  tools: () => request('/sop-admin/tools'),
  // The editable tree of the current version: { tree, base_version, audit_count, ... }.
  current: (code) => request(`/sop-admin/tools/${encodeURIComponent(code)}/current`),
  // One stored version, read-only (the tree includes row ids).
  version: (code, version) =>
    request(`/sop-admin/tools/${encodeURIComponent(code)}/versions/${encodeURIComponent(version)}`),
  // body: { tree, base_version, change_note }. 409 = stale, 422 = invalid (err.detail has the lists).
  publish: (code, body) =>
    request(`/sop-admin/tools/${encodeURIComponent(code)}/publish`, { method: 'POST', body }),
}
