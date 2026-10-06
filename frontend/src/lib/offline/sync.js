// Background sync for offline SOP audits (D10, D11, D14).
//
// For every local audit with unsent changes the order is always:
//   1. PUT the audit (idempotent upsert of the changed answers + remarks)
//   2. upload new proof photos / delete removed ones
//   3. POST submit, if the auditor submitted while offline
// Every call is safe to replay, so a connection that drops half way just means
// the next run picks up where this one stopped. Only audits owned by the
// signed-in auditor are pushed; the queue is kept across logout and token
// expiry and resumes when the same auditor signs in again.
import { api, loadSession } from '@/api/client'
import {
  auditsToHydrate, assignmentErrorMessage, localAuditsToDrop, scheduleChanges,
} from './assigned'
import {
  currentUserId, deleteLocalAudit, dropAttachmentRecord, getSyncBundle,
  hydrateFromServer, listLocalAudits, listUnsynced, markAttachmentUploaded,
  markPushed, patchAudit, refreshReferenceData,
} from './store'

const TICK_MS = 30000
const MAX_BACKOFF_MS = 60000

let state = { status: 'idle', pending: 0, errors: 0, lastSync: null, message: null }
const listeners = new Set()

let running = false
let rerun = false
let rerunRefresh = false
let started = false
let failures = 0
let retryTimer = null
let debounceTimer = null
let tickTimer = null

function setState(patch) {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}

export function getSyncState() {
  return state
}

export function subscribeSync(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function isAuditor() {
  return loadSession()?.user?.role === 'AUDITOR'
}

// Recount unsynced audits (call after any local edit so the chip updates).
export async function refreshPending() {
  if (!currentUserId()) return
  const left = await listUnsynced()
  setState({
    pending: left.filter((a) => !a.sync_error).length,
    errors: left.filter((a) => a.sync_error).length,
  })
}

// Local edits call this: update the chip now, push shortly after.
export function requestSync() {
  refreshPending().catch(() => {})
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (navigator.onLine) syncNow().catch(() => {})
  }, 1500)
}

async function handleAuditError(audit, err) {
  if (err.offline || err.status === 401) throw err
  const assignment = assignmentErrorMessage(err)
  if (assignment) {
    // Reassigned or cancelled: do not retry, and keep what the auditor entered.
    await patchAudit(audit.id, { sync_error: assignment })
    return
  }
  if (err.status === 409) {
    // Server already holds a submitted version: take its answer as truth.
    await hydrateFromServer(audit.id)
    return
  }
  if (err.status >= 400 && err.status < 500) {
    // Rejected for a reason retrying will not fix; surface it on the audit.
    await patchAudit(audit.id, { sync_error: err.message })
    return
  }
  throw err
}

async function syncAudit(id) {
  let b = await getSyncBundle(id)
  if (!b) return
  const { audit, rows } = b

  // 1. answers + remarks
  const dirty = Object.values(rows).filter((r) => r.rev > r.synced_rev)
  if (!audit.remote || dirty.length || audit.header_rev > audit.header_synced_rev) {
    try {
      await api.sopSaveAudit(audit.id, {
        template_id: audit.template_id,
        store_id: audit.store_id,
        overall_remarks: audit.overall_remarks,
        client_created_at: audit.created_at,
        scores: dirty.map((r) => ({
          criterion_id: r.criterion_id,
          score: r.score,
          is_na: r.is_na,
          comment: r.comment || null,
          answered_at: r.answered_at,
        })),
      })
      await markPushed(
        audit.id,
        dirty.map((r) => ({ criterion_id: r.criterion_id, rev: r.rev })),
        audit.header_rev,
      )
    } catch (err) {
      return handleAuditError(audit, err)
    }
  }

  // 2. proof photos
  b = await getSyncBundle(id)
  for (const att of b.attachments) {
    try {
      if (att.deleted) {
        if (att.uploaded) await api.sopDeleteAttachment(audit.id, att.id)
        await dropAttachmentRecord(att.id)
      } else if (!att.uploaded) {
        await api.sopUploadAttachment(audit.id, att.id, att.criterion_id, att.blob)
        await markAttachmentUploaded(att.id)
      }
    } catch (err) {
      return handleAuditError(audit, err)
    }
  }

  // 3. submit
  b = await getSyncBundle(id)
  if (b.audit.submit_pending) {
    try {
      const res = await api.sopSubmit(audit.id, {
        overall_remarks: b.audit.overall_remarks,
        client_submitted_at: b.audit.submitted_client_at,
      })
      await patchAudit(audit.id, {
        status: 'Submitted',
        submit_pending: false,
        header_synced_rev: b.audit.header_rev,
        server_summary: {
          score: res.score, max_score: res.max_score, percent: res.percent,
        },
      })
    } catch (err) {
      if (err.status === 422) {
        // Server rules differ from what the phone had cached (e.g. a proof
        // flag changed). Re-download the audit tools so the review screen
        // highlights what is missing, then unlock the audit for fixing.
        await refreshReferenceData().catch(() => {})
        await patchAudit(audit.id, {
          status: 'Draft',
          submit_pending: false,
          sync_error: err.message,
        })
        return
      }
      return handleAuditError(audit, err)
    }
  }
}

// Assigned audits: pull Planned audits onto the device so they work offline,
// refresh rescheduled ones, and drop never-started local copies the manager
// cancelled or reassigned. Never throws; a failure just means try next time.
export async function syncAssigned() {
  if (!currentUserId() || !isAuditor() || !navigator.onLine) return
  try {
    const serverPlanned = await api.sopAudits('?status=Planned')
    const local = await listLocalAudits()
    const unsynced = new Set((await listUnsynced()).map((a) => a.id))
    for (const id of auditsToHydrate(serverPlanned, local)) {
      await hydrateFromServer(id).catch(() => {})
    }
    const byId = new Map(serverPlanned.map((s) => [s.id, s]))
    for (const a of local) {
      const patch = unsynced.has(a.id) ? null : scheduleChanges(a, byId.get(a.id))
      if (patch) await patchAudit(a.id, patch)
    }
    for (const id of localAuditsToDrop(local, serverPlanned, unsynced)) {
      await deleteLocalAudit(id)
    }
  } catch {
    // offline or server trouble: the regular sync reports that
  }
}

export async function syncNow({ refresh = false } = {}) {
  if (!currentUserId() || !isAuditor()) return
  if (running) {
    rerun = true
    rerunRefresh = rerunRefresh || refresh
    return
  }
  running = true
  try {
    let doRefresh = refresh
    do {
      rerun = false
      rerunRefresh = false
      await runOnce(doRefresh)
      doRefresh = rerunRefresh
    } while (rerun)
  } finally {
    running = false
  }
}

async function runOnce(refresh) {
  setState({ status: 'syncing', message: null })
  let status = 'synced'
  let message = null
  try {
    for (const a of await listUnsynced()) {
      if (!a.sync_error) await syncAudit(a.id)
    }
    if (refresh) {
      await syncAssigned()
      await refreshReferenceData()
    }
    failures = 0
  } catch (err) {
    failures += 1
    if (err.offline) status = 'offline'
    else if (err.status === 401) status = 'auth'
    else {
      status = 'error'
      message = err.message
    }
  }
  await refreshPending()
  setState({
    status,
    message,
    lastSync: status === 'synced' ? new Date().toISOString() : state.lastSync,
  })
  if (status === 'offline' || status === 'error') scheduleRetry()
}

function scheduleRetry() {
  clearTimeout(retryTimer)
  const delay = Math.min(MAX_BACKOFF_MS, 5000 * 2 ** Math.min(failures, 4))
  retryTimer = setTimeout(() => {
    if (navigator.onLine) syncNow().catch(() => {})
  }, delay)
}

function onOnline() {
  failures = 0
  syncNow({ refresh: true }).catch(() => {})
}

function onOffline() {
  setState({ status: 'offline' })
}

function onVisible() {
  if (document.visibilityState === 'visible' && navigator.onLine) {
    syncNow().catch(() => {})
  }
}

export function startSync() {
  if (started) return
  started = true
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)
  tickTimer = setInterval(() => {
    if (navigator.onLine && state.pending > 0) syncNow().catch(() => {})
  }, TICK_MS)
  refreshPending().catch(() => {})
  if (navigator.onLine) syncNow({ refresh: true }).catch(() => {})
  else setState({ status: 'offline' })
}

export function stopSync() {
  if (!started) return
  started = false
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  document.removeEventListener('visibilitychange', onVisible)
  clearInterval(tickTimer)
  clearTimeout(retryTimer)
  clearTimeout(debounceTimer)
  setState({ status: 'idle', pending: 0, errors: 0, message: null })
}
