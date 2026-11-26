// Audit statuses and the "stage" vocabulary. A stage is the bucket a status
// maps onto, so scheduling, status and dashboards talk about audits in one
// language.
export const AUDIT_STATUSES = ['Planned', 'Ongoing', 'Completed', 'Changes Requested', 'Approved', 'Rejected']

// The audit manager sent the audit back; the auditor fixes the queried questions
// and resubmits. Counted with the audits in progress.
export const CHANGES_REQUESTED = 'Changes Requested'

// An issue the assignee has answered and the auditor has not checked yet.
export const needsReview = (issue) => issue.status === 'Resolved' && !issue.meta?.review

export const STAGES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'approved', label: 'Approved' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rejected', label: 'Rejected' },
]

// The word shown for a stage, the same on badges, tiles and filters.
export const stageLabel = (stage) => STAGES.find((s) => s.value === stage)?.label || stage

const STAGE_OF_STATUS = {
  Planned: 'scheduled',
  Ongoing: 'in_progress',
  Completed: 'completed',
  'Changes Requested': 'in_progress',
  Approved: 'approved',
  Cancelled: 'cancelled',
  Rejected: 'rejected',
}

// Unknown statuses fall back to 'scheduled' when they look like Planned,
// otherwise 'in_progress'.
export function stageOf(status) {
  if (STAGE_OF_STATUS[status]) return STAGE_OF_STATUS[status]
  return /^planned/i.test(status || '') ? 'scheduled' : 'in_progress'
}

// Statuses in which the assigned auditor may still edit answers. With changes
// requested only the questions the manager queried can change (lockedForChanges).
export const AUDITOR_EDITABLE = ['Planned', 'Ongoing', 'Changes Requested']

// True when a question cannot be edited because the audit was sent back for
// changes and this question was not one of the queried ones.
export function lockedForChanges(audit, response) {
  return audit?.status === 'Changes Requested' && response?.review_status !== 'query'
}

export function isAuditorEditable(status) {
  return AUDITOR_EDITABLE.includes(status)
}

export function stageBadgeClass(stage) {
  switch (stage) {
    case 'in_progress':
      return 'border-transparent bg-amber-500 text-white hover:bg-amber-500'
    case 'completed':
    case 'approved':
      return 'border-transparent bg-emerald-600 text-white hover:bg-emerald-600'
    case 'rejected':
      return 'border-transparent bg-red-600 text-white hover:bg-red-600'
    case 'scheduled':
    case 'cancelled':
    default:
      return 'border-transparent bg-muted text-muted-foreground hover:bg-muted'
  }
}
