// What the info buttons on the dashboard say. Keep in step with the backend
// (services compute_audit_score, sync_store_score, routers/dashboard.py) and
// lib/overviewStats.js, lib/executionStats.js.
const AUDIT_SCORE = 'Audit score = weight of Yes answers ÷ weight of Yes and No answers × 100. NA answers are left out.';
const STORE_SCORE = "Store score = average of the store's Completed and Approved audits submitted in the quarter. With none, the imported score stays.";

export const CRITERIA = {
  risk: [
    'Risk is not calculated by a formula: each observation carries the risk level recorded for it (Critical, High, Medium, Low). Blank or other text counts as Unrated.',
    'Share of a level = observations at that level ÷ all observations × 100.',
    'Only observations from audits scheduled in the selected quarter are counted.',
  ],
  storeBars: [
    STORE_SCORE,
    AUDIT_SCORE,
    'Green is 77 or above, amber is 60 to under 77, red is under 60.',
  ],
  region: [
    'Share of a region = audits in the region ÷ all audits in the quarter × 100.',
    'Average score = sum of audit scores ÷ number of audits that have a score.',
  ],
  format: [
    'Format score = sum of store scores in the format ÷ number of scored stores, rounded.',
    STORE_SCORE,
  ],
  distribution: [
    'Each scored store is counted once: above 90, 75 to 90, 60 to under 75, 40 to under 60, or under 40.',
    STORE_SCORE,
  ],
  // ---- Audit Planning --------------------------------------------------------
  totalAudits: ['Every audit scheduled in the selected quarter (or the whole year), cancelled ones included.', 'An audit belongs to the quarter of its planned start date.'],
  planned: ['Audits scheduled but not started yet: no answer has been saved.'],
  ongoingPlan: ['Audits the auditor has started (at least one answer saved) but not submitted. Audits sent back for changes count here too.'],
  completedPlan: ['Audits the auditor has submitted: Completed, Approved and Rejected.'],
  completionRate: ['Completion rate = completed audits ÷ audits that are not cancelled × 100.'],
  byQuarter: ['Each audit counted once, in the quarter of its planned start, coloured by its current status.', 'Always shows all four quarters of the year.'],
  status: ['Audits in the selected quarter by current status.', 'Share = audits with that status ÷ all audits in the quarter × 100.'],
  regionPlan: ["Audits in the selected quarter grouped by the store's region.", 'Share = audits in the region ÷ all audits in the quarter × 100.'],
  formatPlan: ["Audits in the selected quarter grouped by the store's format (COCO, COFO, FOCO, FOFO).", 'Completed includes Approved and Rejected.'],
  workload: ['Audits given to each auditor in the selected quarter.', 'Open = not submitted and not cancelled. Progress = completed ÷ audits × 100.'],

  // ---- Audit Execution -------------------------------------------------------
  onTime: [
    'On-time rate = audits submitted on or before their due date ÷ submitted audits that have a due date × 100.',
    'Submitted means Completed or Approved. Audits with no due date are left out.',
  ],
  overdue: ['Audits not yet submitted (Planned, Ongoing or sent back) whose due date has passed.', 'A Planned audit with no due date is overdue once its planned start day is over. Same rule as the Overdue filter on the Audit page.'],
  awaitingReview: ['Audits the auditor has submitted (status Completed) that you have not yet approved, sent back or rejected.'],
  sentBack: ['Audits you returned to the auditor for changes (status Changes Requested) that have not been resubmitted yet.'],
  timeliness: [
    'Every audit in the quarter that is not cancelled or rejected, placed in one group:',
    'Submitted on time: submitted on or before the due date (or no due date set). Submitted late: after it.',
    'Overdue: not submitted and the due date has passed. Not yet due: not submitted and still within its dates.',
  ],
  attention: [
    'Audits that need you to act, most pressing first:',
    '1. Overdue: not submitted after the due date, oldest first.',
    '2. Sent back: returned to the auditor and not yet resubmitted.',
    '3. Waiting for review: submitted and not yet approved, longest waiting first.',
  ],
  auditorPerf: [
    'For each auditor, the audits in the quarter that are not cancelled or rejected.',
    'On time % = submitted on time ÷ submitted with a due date × 100. Overdue = open audits past their due date.',
    'Sent back = how many times their audits were returned for changes. Avg days = first answer to submit.',
  ],

  // ---- Findings --------------------------------------------------------------
  avgScore: [AUDIT_SCORE, 'Average = sum of audit scores ÷ number of submitted audits that have a score.'],
  auditsScored: ['Submitted audits (Completed or Approved) in the quarter that have a score.'],
  criticalCount: ['High-criticality questions answered No in submitted audits of the quarter. Each answer counts once.'],
  observations: ['Observations recorded in audits scheduled in the selected quarter.'],
  trend: [
    'Average audit score of the submitted audits scheduled in each quarter of the year.',
    AUDIT_SCORE,
    'The dashed line is the target (77%).',
  ],
  process: [
    'Compliance = Yes answers ÷ (Yes + No answers) × 100, for each process. NA answers are left out.',
    'Only answers from submitted audits (Completed or Approved) in the quarter are counted. Lowest first.',
  ],
  critical: [
    'Every High-criticality question answered No in a submitted audit of the quarter, newest first.',
    '"No issue raised" means no follow-up issue was opened from that answer.',
  ],
  failed: [
    'The 10 questions answered No most often in submitted audits of the quarter.',
    'No rate = No answers ÷ (Yes + No answers) for that question × 100. Stores = different stores that answered No.',
  ],
  topBottom: ['Stores ranked by store score for the selected quarter; the five highest and five lowest.', STORE_SCORE],
  observationsCard: [
    'Most common observations: observation texts recorded most often, matched ignoring case and spacing.',
    'Issues raised more than once: issue titles raised two or more times.',
    "For one store, the first list is that store's latest observations instead.",
  ],

  // ---- Issues ----------------------------------------------------------------
  openIssues: ['Issues raised in audits of the quarter that are not Resolved or Closed (Resolved means fixed and waiting for the auditor to accept), as on the Issues page.'],
  overdueIssues: ['Open issues (not Resolved or Closed) whose due date has passed.'],
  closedIssues: ['Issues raised in audits of the quarter that are now Closed.'],
  daysToClose: ['Average days to close = for each closed issue, the time from it being raised to it being closed, averaged.'],
  overdueByStore: ['Stores with overdue issues (open and past their due date), most first.'],
  recentIssues: ['The five latest issues raised in audits of the selected quarter, newest first.'],
};
