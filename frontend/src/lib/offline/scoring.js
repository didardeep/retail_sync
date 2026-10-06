// Pure scoring helpers. These mirror backend/app/services.py
// (compute_sop_score / validate_sop_submit) so the phone shows the same
// totals and blocking problems the server will enforce on submit.

export function flattenCriteria(template) {
  const out = []
  for (const sec of template.sections) {
    sec.criteria.forEach((c, i) => {
      out.push({
        ...c,
        section_code: sec.code,
        section_name: sec.name,
        index_in_section: i,
        section_size: sec.criteria.length,
      })
    })
  }
  return out
}

// A criterion with no answer row yet is N/A only if the template says so.
export function isNa(criterion, row) {
  return row ? !!row.is_na : !!criterion.default_na
}

export function isAnswered(criterion, row) {
  return isNa(criterion, row) || (row != null && row.score != null)
}

export function validateScore(value, marks) {
  if (value === '' || value == null) return null
  const n = Number(value)
  if (Number.isNaN(n)) return 'Enter a number'
  if (n < 0) return 'Score cannot be negative'
  if (n > marks) return `Maximum is ${marks}`
  if ((n * 2) % 1 !== 0) return 'Use steps of 0.5'
  return null
}

// rows: { [criterion_id]: scoreRow }
export function summarize(template, rows) {
  let score = 0
  let max = 0
  let answered = 0
  let applicable = 0
  const sections = template.sections.map((sec) => {
    let s = 0
    let m = 0
    for (const c of sec.criteria) {
      const row = rows[c.id]
      if (isNa(c, row)) continue
      applicable += 1
      m += c.marks
      if (row && row.score != null) {
        answered += 1
        s += row.score
      }
    }
    score += s
    max += m
    return { id: sec.id, code: sec.code, name: sec.name, score: s, max_score: m }
  })
  const percent = max ? Math.round((score / max) * 10000) / 100 : 0
  return { score, max_score: max, percent, answered, applicable, sections }
}

// attachments: array of { criterion_id, deleted? }
export function problems(template, rows, attachments) {
  const withPhoto = new Set(
    attachments.filter((a) => !a.deleted).map((a) => a.criterion_id),
  )
  const out = []
  for (const sec of template.sections) {
    for (const c of sec.criteria) {
      const row = rows[c.id]
      if (isNa(c, row)) continue
      if (!row || row.score == null) {
        out.push({ criterion_id: c.id, problem: 'Not answered' })
        continue
      }
      if (c.requires_comment && !(row.comment || '').trim()) {
        out.push({ criterion_id: c.id, problem: 'Comment required' })
      }
      if (c.requires_photo && !withPhoto.has(c.id)) {
        out.push({ criterion_id: c.id, problem: 'Photo required' })
      }
    }
  }
  return out
}
