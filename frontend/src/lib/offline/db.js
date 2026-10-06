// IndexedDB schema for offline SOP audits (see docs/SOP_Audit_Decisions.md D10).
//
//   templates    full audit-tool trees (sections -> criteria), cached for offline start
//   stores       store list, cached for offline start
//   audits       one record per audit on this device (header + sync flags)
//   scores       one record per (audit, criterion): the auditor's answer
//   attachments  proof photos as Blobs, uploaded to the server when online
//
// Sync is driven by revision counters rather than a separate queue: every
// local edit bumps `rev`, a successful push records `synced_rev = rev` as it
// was when the request was sent, so an edit made mid-request is never lost.
import { openDB } from 'idb'

const DB_NAME = 'retailsync-sop'
let dbPromise = null

export function getDb() {
  if (!dbPromise) {
    // Ask the browser not to evict our data under storage pressure.
    navigator.storage?.persist?.().catch(() => {})
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('templates', { keyPath: 'id' })
        db.createObjectStore('stores', { keyPath: 'id' })
        db.createObjectStore('audits', { keyPath: 'id' })
          .createIndex('by_user', 'auditor_id')
        db.createObjectStore('scores', { keyPath: ['audit_id', 'criterion_id'] })
          .createIndex('by_audit', 'audit_id')
        db.createObjectStore('attachments', { keyPath: 'id' })
          .createIndex('by_audit', 'audit_id')
      },
    })
  }
  return dbPromise
}
