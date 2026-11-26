// The audit manager's pending list: which audits wait for a decision.

const ms = (iso) => {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? null : t
}

// Waiting: submitted (Completed) and not yet decided, oldest first.
// Returned: sent back to the auditor (Changes Requested), newest first.
export function pendingApprovals(audits = []) {
  const waiting = audits
    .filter((a) => a.status === 'Completed')
    .sort((a, b) => (ms(a.submitted_at) ?? Infinity) - (ms(b.submitted_at) ?? Infinity))
  const returned = audits
    .filter((a) => a.status === 'Changes Requested')
    .sort((a, b) => (ms(b.decision_at) ?? 0) - (ms(a.decision_at) ?? 0))
  return { waiting, returned }
}

// Whole days an audit has waited since it was submitted.
export function waitingDays(audit, now = new Date()) {
  const t = ms(audit.submitted_at)
  if (t === null) return 0
  return Math.max(0, Math.floor((now.getTime() - t) / 86400000))
}
