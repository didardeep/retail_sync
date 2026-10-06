// Pure decisions for pulling assigned (Planned) SOP audits onto the device.
// Kept free of IndexedDB and network code so the rules can be tested alone;
// sync.js applies the results.

export const REASSIGNED_MESSAGE = 'This audit was reassigned to someone else'
export const CANCELLED_MESSAGE = 'This audit was cancelled by the audit manager'

// Server Planned audits that are not on this device yet.
export function auditsToHydrate(serverPlanned, localAudits) {
  const have = new Set(localAudits.map((a) => a.id))
  return serverPlanned.filter((s) => !have.has(s.id)).map((s) => s.id)
}

// Local copies that should be removed: still Planned here, never edited
// (not unsynced), and the server no longer lists them as Planned for this
// auditor (cancelled, reassigned, or started on another device).
export function localAuditsToDrop(localAudits, serverPlanned, unsyncedIds) {
  const live = new Set(serverPlanned.map((s) => s.id))
  const unsynced = unsyncedIds instanceof Set ? unsyncedIds : new Set(unsyncedIds)
  return localAudits
    .filter((a) => a.status === 'Planned' && a.remote && !unsynced.has(a.id) && !live.has(a.id))
    .map((a) => a.id)
}

// Fields to refresh on an untouched local Planned audit when the manager
// rescheduled it or edited the notes, or null when nothing changed.
export function scheduleChanges(local, server) {
  if (!server || local.status !== 'Planned') return null
  const patch = {}
  if ((local.scheduled_at || null) !== (server.scheduled_at || null)) {
    patch.scheduled_at = server.scheduled_at || null
  }
  if ((local.notes || null) !== (server.notes || null)) patch.notes = server.notes || null
  return Object.keys(patch).length ? patch : null
}

// What a rejected save means for the auditor, or null when it is not one of
// the assignment cases. 403 = another auditor now owns it; 409 with status
// Cancelled = the manager cancelled it. Local data is kept either way.
export function assignmentErrorMessage(err) {
  if (err.status === 403) return REASSIGNED_MESSAGE
  if (err.status === 409 && err.detail?.status === 'Cancelled') return CANCELLED_MESSAGE
  return null
}
