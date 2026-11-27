// Pure helpers for the checklist (Yes/No/NA) audit wizard.
// No React and no network here so the rules can be unit tested.
import { isAuditorEditable as isEditableStatus } from './statuses.js'
import { hasValues } from './annexureTable.js'

export const ANSWERS = ['Yes', 'No', 'NA']
export const RISKS = ['', 'Low', 'Medium', 'High', 'Critical']

// Same values as the server (backend/app/services compute_audit_score).
const ANSWER_VALUE = { Yes: 1, No: 0 }

const NO_PROCESS = 'General'

const processOf = (r) => r.process || NO_PROCESS

// Questions in a stable order, grouped by process (processes in order of first
// appearance, original order kept inside a process). Each item carries its
// position (index), its process and its place inside that process.
export function orderedQuestions(audit) {
  const responses = audit?.responses || []
  const groups = new Map()
  for (const r of responses) {
    const p = processOf(r)
    if (!groups.has(p)) groups.set(p, [])
    groups.get(p).push(r)
  }
  const out = []
  for (const [process, items] of groups) {
    items.forEach((r, i) => {
      out.push({
        ...r,
        process,
        index: out.length,
        index_in_process: i,
        process_size: items.length,
      })
    })
  }
  return out
}

// Process names in wizard order, each with the index of its first question.
export function processes(audit) {
  const seen = []
  for (const q of orderedQuestions(audit)) {
    if (!seen.some((s) => s.name === q.process)) seen.push({ name: q.process, first: q.index })
  }
  return seen
}

export function progress(audit) {
  const responses = audit?.responses || []
  const total = responses.length
  const answered = responses.filter((r) => !!r.answer).length
  const percent = total ? Math.round((answered / total) * 100) : 0
  return { answered, total, percent }
}

// Score the way the server will: NA and unanswered are left out, the rest are
// weighted. Returns null when nothing is scored yet.
export function previewScore(audit) {
  let earned = 0
  let possible = 0
  for (const r of audit?.responses || []) {
    if (!r.answer || r.answer === 'NA') continue
    const w = r.weight || 1
    possible += w
    earned += w * (ANSWER_VALUE[r.answer] ?? 0)
  }
  if (possible === 0) return null
  return Math.round((earned / possible) * 10000) / 100
}

// What an answer still lacks before submitting. A No must say what was wrong
// (remarks) and show it (evidence); an NA must say why it does not apply
// (remarks). Empty for Yes. Same rule as the server's submit.
export function missingProof(q) {
  if (q?.answer !== 'No' && q?.answer !== 'NA') return []
  const missing = []
  if (!String(q.remarks || '').trim()) missing.push('remarks')
  if (q.answer === 'No' && !q.evidence?.length) missing.push('evidence')
  return missing
}

// An answered question whose annexure table is still empty. Required unless the
// answer is NA (the question does not apply). Same rule as the server's submit.
export function missingAnnexure(q) {
  return !!(q?.answer && q.answer !== 'NA' && q.annexure_template && !hasValues(q.annexure))
}

// "A No answer" / "An NA answer", for messages.
export function answerPhrase(answer) {
  return `${answer === 'NA' ? 'An' : 'A'} ${answer} answer`
}

export function proofLabel(missing) {
  return missing.length === 2 ? 'remarks and evidence' : missing.join('')
}

// What the review screen needs to flag. kind is 'unanswered', 'no_proof' (a No
// without remarks or evidence, or an NA without a reason) or 'no_annexure' (an
// empty annexure table); all three block submit. Or 'critical_no' (a
// critical question answered No with no issue raised yet; issues are never
// raised automatically, the auditor decides).
export function problems(audit) {
  const out = []
  for (const q of orderedQuestions(audit)) {
    const base = { index: q.index, id: q.id, code: q.question_code, text: q.question_text, process: q.process }
    const missing = missingProof(q)
    if (!q.answer) {
      out.push({ kind: 'unanswered', ...base })
    } else if (missing.length) {
      out.push({ kind: 'no_proof', missing, answer: q.answer, ...base })
    } else if (missingAnnexure(q)) {
      out.push({ kind: 'no_annexure', ...base })
    }
    if (q.is_critical && q.answer === 'No' && !q.issue_id) {
      out.push({ kind: 'critical_no', ...base })
    }
  }
  return out
}

export function firstUnansweredIndex(audit) {
  return orderedQuestions(audit).findIndex((q) => !q.answer)
}

export function isAuditorEditable(audit, user) {
  if (!audit || !user) return false
  if (user.role !== 'AUDITOR') return false
  if (audit.auditor_id !== user.id) return false
  return isEditableStatus(audit.status)
}

// Parse a ?q=<index> deep link; null when absent or out of range.
export function parseQuestionParam(value, total) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n >= total) return null
  return n
}
