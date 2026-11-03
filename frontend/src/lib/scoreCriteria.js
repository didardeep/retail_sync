// What the info buttons on the dashboard say. Keep in step with the backend
// (services compute_audit_score, sync_store_score) and lib/overviewStats.js.
const AUDIT_SCORE = 'Audit score = weight of Yes answers ÷ weight of Yes and No answers × 100. NA answers are left out.';
const STORE_SCORE = "Store score = average of the store's Completed and Approved audits submitted in the quarter. With none, the imported score stays.";

export const CRITERIA = {
  trend: [
    'Brand score for a quarter = sum of its store scores ÷ number of scored stores.',
    STORE_SCORE,
    AUDIT_SCORE,
    'Stores with no score are left out. Benchmark is 90%.',
  ],
  risk: [
    'Risk is not calculated by a formula: each observation carries the risk level recorded for it (Critical, High, Medium, Low). Blank or other text counts as Unrated.',
    'Share of a level = observations at that level ÷ all observations × 100.',
    'Only observations from audits scheduled in the selected quarter are counted.',
  ],
  storeBars: [
    STORE_SCORE,
    AUDIT_SCORE,
    'Green is 77 or above, amber is below 77.',
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
  exceptions: [
    'From the imported data, not the audits. The quarter buttons do not change this list.',
    'Cash: any difference. High from Rs. 1,000.',
    'Deposit: any shortfall (High), or handover more than 2 days late (Medium).',
    'Stock: expiry date on or before the review date (High).',
  ],
};
