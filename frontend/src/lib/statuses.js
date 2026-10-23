// Audit statuses and the "stage" vocabulary. A stage is the bucket a status
// maps onto, so scheduling, status and dashboards talk about audits in one
// language.
export const AUDIT_STATUSES = ['Planned', 'Ongoing', 'Completed', 'Approved']

export const STAGES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'approved', label: 'Approved' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STAGE_OF_STATUS = {
  Planned: 'scheduled',
  Ongoing: 'in_progress',
  Completed: 'completed',
  Approved: 'approved',
  Cancelled: 'cancelled',
}

// Unknown statuses fall back to 'scheduled' when they look like Planned,
// otherwise 'in_progress'.
export function stageOf(status) {
  if (STAGE_OF_STATUS[status]) return STAGE_OF_STATUS[status]
  return /^planned/i.test(status || '') ? 'scheduled' : 'in_progress'
}

// Statuses in which the assigned auditor may still edit answers.
export const AUDITOR_EDITABLE = ['Planned', 'Ongoing']

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
    case 'scheduled':
    case 'cancelled':
    default:
      return 'border-transparent bg-muted text-muted-foreground hover:bg-muted'
  }
}
