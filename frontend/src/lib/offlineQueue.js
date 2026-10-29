// Pure rules for the offline answer queue of checklist audits.
// No React, no IndexedDB and no network here so the rules can be unit tested.
//
// A queue entry is { audit_id, resp_id, patch, seq }: the not yet synced change
// to one question. Changes to the same question are folded into one entry, and
// entries are sent in order of seq (the order the auditor last touched them).
import { isAuditorEditable } from './statuses.js'

const KEEP_LOCAL = 'Your answers are kept on this device until you dismiss this message.'

// Fold a new change into the queue. The same question keeps one entry whose
// patch is the older patch overlaid with the newer one, with the newer seq.
// Returns a new array.
export function enqueueChange(queue, change, seq) {
  const same = (e) => e.audit_id === change.audit_id && e.resp_id === change.resp_id
  const old = queue.find(same)
  return [...queue.filter((e) => !same(e)), {
    audit_id: change.audit_id,
    resp_id: change.resp_id,
    patch: { ...(old?.patch || {}), ...change.patch },
    seq,
  }]
}

// Entries in the order they must be sent.
export function sendOrder(queue) {
  return [...queue].sort((a, b) => a.seq - b.seq)
}

// Next entry to send, skipping audits that are blocked by a conflict.
export function nextEntry(queue, blockedAuditIds = []) {
  return sendOrder(queue).find((e) => !blockedAuditIds.includes(e.audit_id)) || null
}

// An entry may be dropped after a successful send only if nothing newer was
// queued for that question while the request was in flight.
export function isSameEntry(current, sent) {
  return !!current && current.seq === sent.seq
}

// The audit with the queued changes laid over it. The device wins: a queued
// answer replaces whatever the server had for that question.
export function applyPending(audit, entries) {
  if (!audit) return audit
  const mine = entries.filter((e) => e.audit_id === audit.id)
  if (!mine.length) return audit
  const byResp = new Map(mine.map((e) => [e.resp_id, e.patch]))
  return {
    ...audit,
    status: audit.status === 'Planned' ? 'Ongoing' : audit.status,
    responses: (audit.responses || []).map((r) => (byResp.has(r.id) ? { ...r, ...byResp.get(r.id) } : r)),
  }
}

// Decide what the wizard should show after loading an audit.
//   server  the audit as the server has it now (null when offline)
//   cached  the copy stored on this device (null when none)
//   entries the queued changes of this device
// Returns { audit, conflict }. conflict is null or { reason, message }.
// Own in-progress audit: the device wins. If the server no longer lets the
// auditor edit it, nothing is overwritten and a conflict is reported.
export function reconcile({ server, cached, entries }) {
  const id = (server || cached)?.id
  const mine = entries.filter((e) => e.audit_id === id)
  if (!server) return { audit: applyPending(cached, mine), conflict: null }
  if (!mine.length) return { audit: server, conflict: null }
  if (!isAuditorEditable(server.status)) {
    return {
      audit: applyPending(cached || server, mine),
      conflict: {
        reason: 'status',
        message: `This audit is now ${server.status} on the server, so your offline changes were not applied. ${KEEP_LOCAL}`,
      },
    }
  }
  return { audit: applyPending(server, mine), conflict: null }
}

// What a failed send means for the queue.
//   offline   no connection: stop and wait for the 'online' event
//   retry     server trouble: try again later with backoff
//   auth      logged out: stop until the auditor signs in again
//   conflict  the server refused this change for good (submitted, gone,
//             not yours, invalid): keep the local copy and tell the auditor
export function classifyError(err) {
  if (!err || err.offline || !err.status) return { kind: 'offline' }
  if (err.status === 401) return { kind: 'auth' }
  if (err.status === 409) {
    return {
      kind: 'conflict',
      message: `This audit was submitted or closed on the server, so your offline changes were not applied. ${KEEP_LOCAL}`,
    }
  }
  if ([403, 404, 422].includes(err.status)) {
    return {
      kind: 'conflict',
      message: `The server did not accept your changes (${err.message || err.status}). ${KEEP_LOCAL}`,
    }
  }
  return { kind: 'retry' }
}

// Wait before retry number `attempts` (0 based): 1s, 2s, 4s ... capped at 30s.
export function retryDelay(attempts) {
  return Math.min(30000, 1000 * 2 ** Math.max(0, attempts))
}

const changes = (n) => `${n} ${n === 1 ? 'change' : 'changes'}`

// One state for the sync chip. Conflict beats everything, then offline.
export function syncSummary({ online, pending = 0, syncing = false, conflict = false, auth = false, failing = false }) {
  if (conflict) return { state: 'conflict', label: 'Conflict', tone: 'bad' }
  if (auth) return { state: 'auth', label: 'Sign in again to sync', tone: 'warn' }
  if (!online) {
    return {
      state: 'offline',
      label: pending > 0 ? `Offline - ${changes(pending)} waiting` : 'Offline',
      tone: 'warn',
    }
  }
  if (syncing) return { state: 'syncing', label: 'Syncing...', tone: 'info' }
  if (pending > 0) {
    return {
      state: failing ? 'retrying' : 'waiting',
      label: `${changes(pending)} waiting`,
      tone: failing ? 'bad' : 'info',
    }
  }
  return { state: 'online', label: 'Online', tone: 'ok' }
}

// Why the audit cannot be submitted right now, or null when it can.
// Submitting needs every answer on the server first.
export function submitBlock({ online, pending = 0, conflict = false }) {
  if (conflict) return 'Resolve the sync conflict before submitting.'
  if (!online) return 'You are offline. Reconnect to submit; your answers are saved on this device.'
  if (pending > 0) {
    return `${changes(pending)} ${pending === 1 ? 'is' : 'are'} not synced yet. Wait for sync to finish, then submit.`
  }
  return null
}
