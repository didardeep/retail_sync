// Question version history: labels and plain-text values for each versioned field,
// and a side-by-side comparison of two versions. The server sends each version's
// full content (like a git commit), so any two can be compared here.

export const FIELD_LABELS = {
  text: 'Question',
  process: 'Process',
  sub_process: 'Sub-process',
  audit_type: 'Type',
  criticality: 'Criticality',
  active: 'Active',
  tags: 'Tags',
  annexure: 'Annexure',
  photo_video_enablement: 'Photo / video',
  data_analyst_enabled: 'Data analyst',
  data_analyst_reference: 'Data analyst reference',
  annex: 'Annex reference',
};

const FIELDS = Object.keys(FIELD_LABELS);

// The content of a version as the history compares it (mirrors _content on the server).
export function contentOf(v) {
  const meta = v?.meta || {};
  return {
    text: v?.text ?? null,
    process: v?.process ?? null,
    sub_process: v?.sub_process ?? null,
    audit_type: v?.audit_type ?? null,
    criticality: v?.criticality || 'Low',
    active: v?.active !== false,
    tags: meta.tags || [],
    annexure: meta.annexure || null,
    photo_video_enablement: v?.photo_video_enablement ?? null,
    data_analyst_enabled: v?.data_analyst_enabled ?? null,
    data_analyst_reference: v?.data_analyst_reference ?? null,
    annex: v?.annex ?? null,
  };
}

// An annexure layout in one line: "Cash, Value (total) | 3 rows: Till 1, Till 2".
export function describeAnnexure(a) {
  if (!a || !a.columns?.length) return 'None';
  const cols = a.columns.map((c) => `${c.name}${c.total ? ' (total)' : ''}`).join(', ');
  const labels = (a.row_labels || []).filter(Boolean);
  const rows = Math.max(a.default_rows || 0, labels.length);
  const header = a.row_header ? `${a.row_header}: ` : '';
  return `${cols} | ${rows} ${rows === 1 ? 'row' : 'rows'}${labels.length ? ` (${header}${labels.join(', ')})` : ''}`;
}

export function describeValue(field, value) {
  if (field === 'annexure') return describeAnnexure(value);
  if (field === 'active') return value === false ? 'No' : 'Yes';
  if (field === 'tags') return value?.length ? value.join(', ') : 'None';
  if (value === null || value === undefined || value === '') return '--';
  return String(value);
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Every field of two versions, marked changed or not, for the compare view.
export function compareVersions(older, newer) {
  const a = contentOf(older);
  const b = contentOf(newer);
  return FIELDS.map((field) => ({
    field,
    label: FIELD_LABELS[field],
    before: describeValue(field, a[field]),
    after: describeValue(field, b[field]),
    changed: !same(a[field], b[field]),
  }));
}

// "Criticality, Annexure" from a server `changes` object; "Created" for a first version.
export function changeSummary(entry) {
  const keys = Object.keys(entry?.changes || {});
  if (!keys.length) return entry?.version === 1 ? 'Created' : 'No changes';
  return keys.map((k) => FIELD_LABELS[k] || k).join(', ');
}

// Who saved a version; first versions imported from the master list have no author.
export function authorOf(entry) {
  return entry?.edited_by || (entry?.version === 1 ? 'Imported' : 'Unknown');
}

// A badge for an answer given on an older wording: "v1, now v6", or '' when current.
export function versionBadge(answeredVersion, currentVersion) {
  if (!answeredVersion || !currentVersion || answeredVersion >= currentVersion) return '';
  return `v${answeredVersion}, now v${currentVersion}`;
}
