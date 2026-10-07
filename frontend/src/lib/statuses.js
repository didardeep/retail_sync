// Audit statuses and the shared "stage" vocabulary. Legacy audits (/audits) and
// SOP audits (/sop-audits) use different status names; a stage is the common
// bucket both map onto, so scheduling, status and dashboards can talk about
// them in one language.
export const LEGACY_STATUSES = ['Planned', 'Ongoing', 'Completed', 'Approved']
export const SOP_STATUSES = ['Planned', 'Draft', 'Submitted', 'Approved', 'Returned', 'Cancelled']

export const STAGES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'approved', label: 'Approved' },
  { value: 'cancelled', label: 'Cancelled' },
]

const LEGACY_STAGE = {
  Planned: 'scheduled',
  Ongoing: 'in_progress',
  Completed: 'completed',
  Approved: 'approved',
  Cancelled: 'cancelled',
}

const SOP_STAGE = {
  Planned: 'scheduled',
  Draft: 'in_progress',
  Returned: 'in_progress',
  Submitted: 'completed',
  Approved: 'approved',
  Cancelled: 'cancelled',
}

// kind is 'legacy' or 'sop'. Unknown statuses fall back to 'scheduled' when
// they look like Planned, otherwise 'in_progress'.
export function stageOf(kind, status) {
  const map = kind === 'sop' ? SOP_STAGE : LEGACY_STAGE
  if (map[status]) return map[status]
  return /^planned/i.test(status || '') ? 'scheduled' : 'in_progress'
}

// Statuses in which the assigned auditor may still edit answers.
// The review stream adds 'Returned' here when it ships.
export const AUDITOR_EDITABLE = ['Planned', 'Draft']

export function isAuditorEditable(status) {
  return AUDITOR_EDITABLE.includes(status)
}

// Statuses that are locked from the auditor's side.
export const FINAL_STATUSES = ['Submitted', 'Approved']

// Same palette as the SOP audit status badges.
export function stageBadgeClass(stage) {
  switch (stage) {
    case 'in_progress':
      return 'border-transparent bg-amber-500 text-white hover:bg-amber-500'
    case 'completed':
    case 'approved':
      return 'border-transparent bg-emerald-600 text-white hover:bg-emerald-600'
    case 'scheduled':
    case 'cancelled':
    default:
      return 'border-transparent bg-muted text-muted-foreground hover:bg-muted'
  }
}
