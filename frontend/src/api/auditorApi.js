// API calls for the auditor's Audit page. Kept out of client.js so this page
// and the other tracks do not edit the same file.
import { request } from './client'

// Starts a checklist (classic) audit for a store; resolves to the new audit.
export const startChecklistAudit = (store_id, checklist_id) =>
  request('/audits/start', { method: 'POST', body: { store_id, checklist_id } })

// Checklists an auditor can start. Online only.
export const listChecklists = () => request('/checklists')
