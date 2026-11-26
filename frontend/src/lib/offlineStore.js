// IndexedDB for offline checklist audits.
//
//   audits     the audit as last seen (questions + answers), with local edits applied
//   queue      one entry per question with a change not yet sent to the server
//   conflicts  one record per audit the server refused (kept until dismissed)
//   meta       the counter that orders queue entries
import { openDB } from 'idb'

import { enqueueChange, isSameEntry } from './offlineQueue.js'

const DB_NAME = 'retailsync-checklist'
let dbPromise = null

function getDb() {
  if (!dbPromise) {
    // Ask the browser not to evict our data under storage pressure.
    navigator.storage?.persist?.().catch(() => {})
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('audits', { keyPath: 'id' })
        db.createObjectStore('queue', { keyPath: ['audit_id', 'resp_id'] })
        db.createObjectStore('conflicts', { keyPath: 'audit_id' })
        db.createObjectStore('meta')
      },
    })
  }
  return dbPromise
}

export async function cacheAudit(audit) {
  const db = await getDb()
  await db.put('audits', { ...audit, cached_at: Date.now() })
}

export async function getCachedAudit(id) {
  return (await getDb()).get('audits', id)
}

// Audits stored on this device that belong to this auditor.
export async function listCachedAudits(userId) {
  const all = await (await getDb()).getAll('audits')
  return all.filter((a) => a.auditor_id === userId)
}

export async function removeCachedAudit(id) {
  await (await getDb()).delete('audits', id)
}

// Change fields of one cached answer (no queueing).
export async function updateCachedResponse(auditId, respId, fields) {
  const db = await getDb()
  const audit = await db.get('audits', auditId)
  if (!audit) return
  audit.responses = (audit.responses || []).map((r) => (r.id === respId ? { ...r, ...fields } : r))
  await db.put('audits', audit)
}

// Save one change on the device: queue it and apply it to the cached audit in
// one transaction, so the two can never disagree.
export async function recordChange(auditId, respId, patch) {
  const db = await getDb()
  const tx = db.transaction(['audits', 'queue', 'meta'], 'readwrite')
  const seq = ((await tx.objectStore('meta').get('seq')) || 0) + 1
  await tx.objectStore('meta').put(seq, 'seq')
  const old = await tx.objectStore('queue').get([auditId, respId])
  const [entry] = enqueueChange(old ? [old] : [], { audit_id: auditId, resp_id: respId, patch }, seq)
  await tx.objectStore('queue').put(entry)
  const audit = await tx.objectStore('audits').get(auditId)
  if (audit) {
    audit.status = audit.status === 'Planned' ? 'Ongoing' : audit.status
    audit.responses = (audit.responses || []).map((r) => (r.id === respId ? { ...r, ...patch } : r))
    await tx.objectStore('audits').put(audit)
  }
  await tx.done
  return entry
}

export async function listQueue() {
  return (await getDb()).getAll('queue')
}

// Drop a sent entry unless a newer change to the same question arrived meanwhile.
export async function removeEntryIfUnchanged(entry) {
  const db = await getDb()
  const tx = db.transaction('queue', 'readwrite')
  const current = await tx.store.get([entry.audit_id, entry.resp_id])
  if (isSameEntry(current, entry)) await tx.store.delete([entry.audit_id, entry.resp_id])
  await tx.done
}

export async function setConflict(auditId, info) {
  await (await getDb()).put('conflicts', { audit_id: auditId, ...info, at: Date.now() })
}

export async function listConflicts() {
  return (await getDb()).getAll('conflicts')
}

// The auditor accepted the server's version: forget the local copy and the
// unsent changes of this audit.
export async function discardLocal(auditId) {
  const db = await getDb()
  const tx = db.transaction(['audits', 'queue', 'conflicts'], 'readwrite')
  const keys = await tx.objectStore('queue').getAllKeys()
  for (const k of keys) {
    if (k[0] === auditId) await tx.objectStore('queue').delete(k)
  }
  await tx.objectStore('conflicts').delete(auditId)
  await tx.objectStore('audits').delete(auditId)
  await tx.done
}
