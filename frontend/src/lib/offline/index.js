// Public surface of the offline layer. Pages import from here only.
// Reads come straight from the local store; every write is saved to
// IndexedDB first and then nudges the sync engine.
import {
  addAttachment as addAttachmentLocal,
  createAudit as createAuditLocal,
  removeAttachment as removeAttachmentLocal,
  requestSubmit as requestSubmitLocal,
  saveAnswer as saveAnswerLocal,
  setHeader as setHeaderLocal,
} from './store'
import { requestSync } from './sync'

export {
  currentUserId, findDraft, getBundle, getStores, getTemplate, getTemplates,
  hydrateFromServer, listLocalAudits, listUnsynced, refreshReferenceData,
} from './store'
export { getSyncState, refreshPending, startSync, stopSync, subscribeSync, syncNow } from './sync'
export { compressImage } from './image'
export * from './scoring'
export { useOnline, useSyncState } from './hooks'

async function andSync(promise) {
  const result = await promise
  requestSync()
  return result
}

export const createAudit = (store, template) => andSync(createAuditLocal(store, template))
export const saveAnswer = (auditId, criterion, patch) =>
  andSync(saveAnswerLocal(auditId, criterion, patch))
export const addAttachment = (auditId, criterionId, blob) =>
  andSync(addAttachmentLocal(auditId, criterionId, blob))
export const removeAttachment = (id) => andSync(removeAttachmentLocal(id))
export const requestSubmit = (auditId) => andSync(requestSubmitLocal(auditId))

// Bookmarking the wizard position is not data, so it does not trigger sync;
// remarks are data and do.
export async function setHeader(auditId, patch) {
  const result = await setHeaderLocal(auditId, patch)
  if ('overall_remarks' in patch) requestSync()
  return result
}
