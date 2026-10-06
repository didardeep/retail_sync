// Pure calculations for the SOP dashboard tab. No React in here, so every
// number on screen can be checked in isolation. All inputs come from
// GET /api/sop-dashboard (see backend/app/routers/sop_dashboard.py).

// Score bands. 80 matches "best in class is the target"; below 70 needs attention.
export const TARGET = 80
export const ATTENTION = 70
// A criterion counts as "scored low" in an audit below this share of its marks.
export const LOW_CRITERION_RATIO = 0.6
export const PARETO_LIMIT = 10

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
export const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10)

// A question keeps its `key` through every version of a tool, so everything
// below groups and filters by key. The old `key ?? id` fallback only covers
// data from a server that does not send keys yet.
export const keyOfCriterion = (c) => c.key ?? c.id
export const keyOfScore = (r) => r.criterion_key ?? r.criterion_id

export function buildIndex(data) {
  const criterionByKey = Object.fromEntries(data.criteria.map((c) => [keyOfCriterion(c), c]))
  return {
    storeById: Object.fromEntries(data.stores.map((s) => [s.id, s])),
    criterionByKey,
    // Same lookup under its old name: ?criterion= now holds a key.
    criterionById: criterionByKey,
  }
}

export function bandFor(percent) {
  if (percent == null) return 'none'
  if (percent >= TARGET) return 'good'
  if (percent >= ATTENTION) return 'warn'
  return 'bad'
}

// filters: { tool, region, store } (empty string = no filter)
export function filterAudits(data, filters, index) {
  return data.audits.filter((a) => {
    const store = index.storeById[a.store_id]
    return (
      (!filters.tool || a.template_code === filters.tool) &&
      (!filters.region || store?.region === filters.region) &&
      (!filters.store || a.store_id === filters.store)
    )
  })
}

export function storesInScope(data, filters) {
  return data.stores.filter(
    (s) => (!filters.region || s.region === filters.region) && (!filters.store || s.id === filters.store),
  )
}

// A store's score = average of its latest audit for each tool in scope.
export function storeRanking(audits, index) {
  const latestByStore = new Map()
  for (const a of audits) {
    const perTool = latestByStore.get(a.store_id) ?? new Map()
    const current = perTool.get(a.template_code)
    if (!current || a.submitted_at > current.submitted_at) perTool.set(a.template_code, a)
    latestByStore.set(a.store_id, perTool)
  }
  return [...latestByStore]
    .map(([storeId, perTool]) => {
      const latest = [...perTool.values()]
      return {
        store_id: storeId,
        name: index.storeById[storeId]?.name ?? storeId,
        percent: mean(latest.map((a) => a.percent)),
        tools: latest.map((a) => ({ code: a.template_code, percent: a.percent })),
      }
    })
    .sort((a, b) => b.percent - a.percent)
}

export function kpis(audits, ranking, scopeStores) {
  const deltas = audits.filter((a) => a.prev_percent != null).map((a) => a.percent - a.prev_percent)
  return {
    audits: audits.length,
    avgPercent: mean(audits.map((a) => a.percent)),
    storesAudited: ranking.length,
    storesInScope: scopeStores.length,
    belowAttention: ranking.filter((r) => r.percent < ATTENTION).length,
    avgChange: mean(deltas),
    changeCount: deltas.length,
  }
}

// Average share of marks earned per section, per tool.
export function sectionStats(audits) {
  const bySection = new Map()
  for (const a of audits) {
    for (const s of a.sections) {
      const key = `${a.template_code}:${s.code}`
      const cur = bySection.get(key) ?? {
        key, tool: a.template_code, code: s.code, name: s.name, score: 0, max: 0,
      }
      cur.score += s.score
      cur.max += s.max_score
      bySection.set(key, cur)
    }
  }
  return [...bySection.values()]
    .map((v) => ({ ...v, percent: v.max ? (v.score / v.max) * 100 : null }))
    .sort((a, b) => a.tool.localeCompare(b.tool) || a.code.localeCompare(b.code))
}

// Which criteria lose the most marks across the audits in scope (the 80/20 view).
// `sectionKey` ("CASH:B") narrows it to one section. Rows are one per question
// key (so a question re-published in a new version is one row) and `id` is
// that key; lost marks use each audit's own marks for the question.
export function pareto(data, auditIds, sectionKey, index) {
  const byCriterion = new Map()
  for (const r of data.criterion_scores) {
    if (!auditIds.has(r.audit_id)) continue
    const key = keyOfScore(r)
    const c = index.criterionByKey[key]
    if (!c) continue
    if (sectionKey && `${c.template_code}:${c.section_code}` !== sectionKey) continue
    const cur = byCriterion.get(key) ?? {
      id: key, title: c.title, tool: c.template_code, section: c.section_code,
      lost: 0, marks: 0, scored: 0, count: 0,
    }
    cur.lost += r.marks - r.score
    cur.marks += r.marks
    cur.scored += r.score
    cur.count += 1
    byCriterion.set(key, cur)
  }
  const rows = [...byCriterion.values()].filter((v) => v.lost > 0).sort((a, b) => b.lost - a.lost)
  const totalLost = rows.reduce((sum, r) => sum + r.lost, 0)
  let running = 0
  for (const r of rows) {
    running += r.lost
    r.cumulative = totalLost ? (running / totalLost) * 100 : 0
    r.percent = r.marks ? (r.scored / r.marks) * 100 : null
  }
  return { rows: rows.slice(0, PARETO_LIMIT), totalLost, criteriaWithLoss: rows.length }
}

export function trendByMonth(audits) {
  const byMonth = new Map()
  for (const a of audits) {
    if (!a.submitted_at) continue
    const key = a.submitted_at.slice(0, 7)
    const cur = byMonth.get(key) ?? []
    cur.push(a.percent)
    byMonth.set(key, cur)
  }
  return [...byMonth]
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([month, values]) => ({ month, percent: mean(values), count: values.length }))
}

// Rows for the audits table, honouring the section and criterion cross-filters.
export function tableRows(data, audits, index, { section, criterion, q }) {
  const criterionRows = criterion
    ? new Map(data.criterion_scores.filter((r) => keyOfScore(r) === criterion).map((r) => [r.audit_id, r]))
    : null
  const needle = (q || '').trim().toLowerCase()
  const rows = []
  for (const a of audits) {
    const store = index.storeById[a.store_id]
    const name = store?.name ?? a.store_id
    if (needle && !`${name} ${store?.city ?? ''} ${a.template_code}`.toLowerCase().includes(needle)) continue
    let criterionText = null
    if (criterionRows) {
      const r = criterionRows.get(a.id)
      if (!r || r.score >= r.marks * LOW_CRITERION_RATIO) continue
      criterionText = `${r.score} / ${r.marks}`
    }
    const sec = section ? a.sections.find((s) => `${a.template_code}:${s.code}` === section) : null
    rows.push({
      id: a.id,
      store_id: a.store_id,
      store: name,
      city: store?.city ?? '',
      tool: a.template_code,
      submitted_at: a.submitted_at,
      auditor: a.auditor,
      percent: a.percent,
      delta: a.prev_percent == null ? null : a.percent - a.prev_percent,
      sectionPercent: sec && sec.max_score ? (sec.score / sec.max_score) * 100 : null,
      criterionText,
    })
  }
  return rows
}

// Stores in scope that have no audit, or none within the coverage window.
export function coverage(scopeStores, coverageDays) {
  const rows = scopeStores.map((s) => ({
    ...s,
    status: s.days_since == null ? 'never' : s.days_since > coverageDays ? 'overdue' : 'ok',
  }))
  const attention = rows
    .filter((r) => r.status !== 'ok')
    .sort((a, b) => (b.days_since ?? Infinity) - (a.days_since ?? Infinity))
  return { attention, okCount: rows.length - attention.length, total: rows.length }
}

// CSV of the rows currently shown in the audits table (ASCII only).
export function toCsv(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Store', 'City', 'Tool', 'Submitted', 'Score %', 'Change vs last', 'Auditor'];
  const lines = rows.map((r) => [
    r.store, r.city, r.tool, r.submitted_at ? r.submitted_at.slice(0, 10) : '',
    round1(r.percent), r.delta == null ? '' : round1(r.delta), r.auditor ?? '',
  ].map(esc).join(','));
  return [header.join(','), ...lines].join('\r\n');
}
