// Local-first data access for SOP audits. Everything the UI does goes through
// here and lands in IndexedDB before anything touches the network, so a dropped
// connection, a killed app or a reboot never loses an answer (NFR: durability).
// sync.js reads the same records and pushes whatever has a newer `rev`.
import { api, loadSession } from '@/api/client'
import { getDb } from './db'
import { problems } from './scoring'

export function currentUserId() {
  return loadSession()?.user?.id || null
}

function nowIso() {
  return new Date().toISOString()
}

// --------------------------------------------------------------------------
// Reference data (stores + audit tools), cached for offline start
// --------------------------------------------------------------------------
export async function refreshReferenceData() {
  const [stores, templates] = await Promise.all([api.stores(), api.sopTemplates()])
  const trees = await Promise.all(templates.map((t) => api.sopTemplate(t.id)))
  const db = await getDb()
  const tx = db.transaction(['stores', 'templates'], 'readwrite')
  await tx.objectStore('stores').clear()
  for (const s of stores) tx.objectStore('stores').put(s)
  // Never clear templates: local audits may reference an older tree.
  for (const t of trees) tx.objectStore('templates').put(t)
  await tx.done
}

export async function getStores() {
  const db = await getDb()
  const rows = await db.getAll('stores')
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getTemplates() {
  const db = await getDb()
  const rows = await db.getAll('templates')
  return rows.filter((t) => t.is_active).sort((a, b) => a.name.localeCompare(b.name))
}

export async function getTemplate(id) {
  const db = await getDb()
  const cached = await db.get('templates', id)
  if (cached) return cached
  const tree = await api.sopTemplate(id) // throws if offline and never cached
  await db.put('templates', tree)
  return tree
}

// --------------------------------------------------------------------------
// Audits
// --------------------------------------------------------------------------
export async function createAudit(store, template) {
  const db = await getDb()
  const now = nowIso()
  const audit = {
    id: crypto.randomUUID(),
    auditor_id: currentUserId(),
    template_id: template.id,
    template_name: template.name,
    template_code: template.code,
    store_id: store.id,
    store_name: store.name,
    status: 'Draft',
    submit_pending: false,
    remote: false,               // has the server seen this audit yet?
    overall_remarks: '',
    position: 0,                 // where to resume in the wizard
    header_rev: 1,
    header_synced_rev: 0,
    sync_error: null,
    created_at: now,
    updated_at: now,
  }
  await db.put('audits', audit)
  return audit
}

export async function listLocalAudits() {
  const db = await getDb()
  const uid = currentUserId()
  const rows = await db.getAllFromIndex('audits', 'by_user', uid)
  return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export async function findDraft(storeId, templateId) {
  const audits = await listLocalAudits()
  return audits.find(
    (a) => a.status === 'Draft' && a.store_id === storeId && a.template_id === templateId,
  ) || null
}

// Returns { audit, template, rows: {criterion_id: row}, attachments: [] } or null.
export async function getBundle(id) {
  const db = await getDb()
  const audit = await db.get('audits', id)
  if (!audit) return null
  const [template, scoreRows, attachments] = await Promise.all([
    getTemplate(audit.template_id),
    db.getAllFromIndex('scores', 'by_audit', id),
    db.getAllFromIndex('attachments', 'by_audit', id),
  ])
  const rows = {}
  for (const r of scoreRows) rows[r.criterion_id] = r
  return { audit, template, rows, attachments: attachments.filter((a) => !a.deleted) }
}

export async function setHeader(auditId, patch) {
  const db = await getDb()
  const tx = db.transaction('audits', 'readwrite')
  const audit = await tx.store.get(auditId)
  if (!audit) return null
  Object.assign(audit, patch)
  // Position is only a bookmark; remarks are real data that must sync.
  if ('overall_remarks' in patch) {
    audit.header_rev += 1
    audit.sync_error = null
    audit.updated_at = nowIso()
  }
  await tx.store.put(audit)
  await tx.done
  return audit
}

// Save one answer. `criterion` supplies marks/default_na for new rows.
export async function saveAnswer(auditId, criterion, patch) {
  const db = await getDb()
  const tx = db.transaction(['audits', 'scores'], 'readwrite')
  const audit = await tx.objectStore('audits').get(auditId)
  if (!audit || audit.status !== 'Draft') {
    await tx.done
    return null
  }
  const key = [auditId, criterion.id]
  const row = (await tx.objectStore('scores').get(key)) || {
    audit_id: auditId,
    criterion_id: criterion.id,
    score: null,
    is_na: !!criterion.default_na,
    comment: '',
    answered_at: null,
    rev: 0,
    synced_rev: 0,
  }
  Object.assign(row, patch)
  if (row.is_na) row.score = null
  row.rev += 1
  row.answered_at = nowIso()
  audit.updated_at = row.answered_at
  audit.sync_error = null
  await tx.objectStore('scores').put(row)
  await tx.objectStore('audits').put(audit)
  await tx.done
  return row
}

export async function addAttachment(auditId, criterionId, blob) {
  const db = await getDb()
  const att = {
    id: crypto.randomUUID(),
    audit_id: auditId,
    criterion_id: criterionId,
    blob,
    mime: blob.type || 'image/jpeg',
    size: blob.size,
    uploaded: false,
    deleted: false,
  }
  const tx = db.transaction(['attachments', 'audits'], 'readwrite')
  tx.objectStore('attachments').put(att)
  const audit = await tx.objectStore('audits').get(auditId)
  if (audit) {
    audit.updated_at = nowIso()
    audit.sync_error = null
    tx.objectStore('audits').put(audit)
  }
  await tx.done
  return att
}

export async function removeAttachment(id) {
  const db = await getDb()
  const att = await db.get('attachments', id)
  if (!att) return
  if (att.uploaded) {
    // The server has it: keep a tombstone so sync can delete it remotely.
    await db.put('attachments', { ...att, deleted: true })
  } else {
    await db.delete('attachments', id)
  }
}

// Lock the audit locally and queue the submit. Throws with `.problems` if the
// audit is not complete -- the review screen shows these before this point.
export async function requestSubmit(auditId) {
  const bundle = await getBundle(auditId)
  if (!bundle) throw new Error('Audit not found on this device')
  const found = problems(bundle.template, bundle.rows, bundle.attachments)
  if (found.length) {
    const err = new Error(`${found.length} problem(s) must be fixed before submitting`)
    err.problems = found
    throw err
  }
  const db = await getDb()
  const audit = { ...bundle.audit }
  audit.status = 'Submitted'
  audit.submit_pending = true
  audit.submitted_client_at = nowIso()
  audit.header_rev += 1
  audit.sync_error = null
  audit.updated_at = audit.submitted_client_at
  await db.put('audits', audit)
  return audit
}

// Pull an audit that exists only on the server (e.g. started on another
// device) into local storage so it can be resumed or viewed offline.
export async function hydrateFromServer(id) {
  const detail = await api.sopAudit(id)
  const template = await getTemplate(detail.template_id)
  const blobs = await Promise.all(
    detail.attachments.map((a) => api.sopAttachmentBlob(a.url).catch(() => null)),
  )
  const db = await getDb()
  // Server is the truth here, so drop any stale local rows first.
  const [oldScores, oldAtts] = await Promise.all([
    db.getAllKeysFromIndex('scores', 'by_audit', id),
    db.getAllKeysFromIndex('attachments', 'by_audit', id),
  ])
  const tx = db.transaction(['audits', 'scores', 'attachments'], 'readwrite')
  oldScores.forEach((k) => tx.objectStore('scores').delete(k))
  oldAtts.forEach((k) => tx.objectStore('attachments').delete(k))
  tx.objectStore('audits').put({
    id: detail.id,
    auditor_id: detail.auditor_id,
    template_id: detail.template_id,
    template_name: detail.template,
    template_code: detail.template_code,
    store_id: detail.store_id,
    store_name: detail.store,
    status: detail.status,
    submit_pending: false,
    remote: true,
    overall_remarks: detail.overall_remarks || '',
    position: 0,
    header_rev: 0,
    header_synced_rev: 0,
    sync_error: null,
    created_at: detail.created_at,
    updated_at: detail.updated_at || detail.created_at,
  })
  for (const s of detail.scores) {
    tx.objectStore('scores').put({
      audit_id: id,
      criterion_id: s.criterion_id,
      score: s.score,
      is_na: s.is_na,
      comment: s.comment || '',
      answered_at: s.answered_at,
      rev: 0,
      synced_rev: 0,
    })
  }
  detail.attachments.forEach((a, i) => {
    if (!blobs[i]) return
    tx.objectStore('attachments').put({
      id: a.id,
      audit_id: id,
      criterion_id: a.criterion_id,
      blob: blobs[i],
      mime: a.mime,
      size: a.size,
      uploaded: true,
      deleted: false,
    })
  })
  await tx.done
  return { template }
}

// --------------------------------------------------------------------------
// Sync bookkeeping (used by sync.js)
// --------------------------------------------------------------------------
export function auditNeedsSync(audit, rows, attachments) {
  if (!audit.remote) return true
  if (audit.header_rev > audit.header_synced_rev) return true
  if (audit.submit_pending) return true
  if (Object.values(rows).some((r) => r.rev > r.synced_rev)) return true
  return attachments.some((a) => (!a.uploaded && !a.deleted) || (a.uploaded && a.deleted))
}

// Raw rows for sync (includes tombstoned attachments).
export async function getSyncBundle(id) {
  const db = await getDb()
  const audit = await db.get('audits', id)
  if (!audit) return null
  const [scoreRows, attachments] = await Promise.all([
    db.getAllFromIndex('scores', 'by_audit', id),
    db.getAllFromIndex('attachments', 'by_audit', id),
  ])
  const rows = {}
  for (const r of scoreRows) rows[r.criterion_id] = r
  return { audit, rows, attachments }
}

export async function listUnsynced() {
  const db = await getDb()
  const audits = await listLocalAudits()
  const out = []
  for (const a of audits) {
    const [scoreRows, attachments] = await Promise.all([
      db.getAllFromIndex('scores', 'by_audit', a.id),
      db.getAllFromIndex('attachments', 'by_audit', a.id),
    ])
    const rows = {}
    for (const r of scoreRows) rows[r.criterion_id] = r
    if (auditNeedsSync(a, rows, attachments)) out.push(a)
  }
  return out
}

// Mark rows as synced only up to the revision that was actually sent, so an
// edit made while the request was in flight stays dirty.
export async function markPushed(auditId, sentRows, headerRev) {
  const db = await getDb()
  const tx = db.transaction(['audits', 'scores'], 'readwrite')
  for (const { criterion_id, rev } of sentRows) {
    const row = await tx.objectStore('scores').get([auditId, criterion_id])
    if (row && row.synced_rev < rev) {
      row.synced_rev = rev
      await tx.objectStore('scores').put(row)
    }
  }
  const audit = await tx.objectStore('audits').get(auditId)
  if (audit) {
    audit.remote = true
    audit.header_synced_rev = Math.max(audit.header_synced_rev, headerRev)
    await tx.objectStore('audits').put(audit)
  }
  await tx.done
}

export async function markAttachmentUploaded(id) {
  const db = await getDb()
  const att = await db.get('attachments', id)
  if (att) await db.put('attachments', { ...att, uploaded: true })
}

export async function dropAttachmentRecord(id) {
  const db = await getDb()
  await db.delete('attachments', id)
}

export async function patchAudit(auditId, patch) {
  const db = await getDb()
  const audit = await db.get('audits', auditId)
  if (!audit) return null
  Object.assign(audit, patch)
  await db.put('audits', audit)
  return audit
}
