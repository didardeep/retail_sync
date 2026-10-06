// Pure helpers for the SOP tool editor: edit a "tree", validate it, diff it.
// No React in here. validateTree and diffTrees mirror backend/app/sop_versions.py
// (the server re-checks everything on publish), so keep the two in step.
//
// A tree is { code, name, min_rule, sections: [{ key, code, name, criteria: [
//   { key, title, marks, max_text, avg_text, min_text, default_na,
//     requires_comment, requires_photo }] }] }.
// `key` is the stable key from the server (null for an item added in the
// editor). Fields starting with `_` are editor-only and never sent.

export const CRITERION_FIELDS = [
  'title', 'marks', 'max_text', 'avg_text', 'min_text',
  'default_na', 'requires_comment', 'requires_photo',
]

export const FIELD_LABELS = {
  name: 'Name', code: 'Code', title: 'Question', marks: 'Marks',
  max_text: 'Best text', avg_text: 'Average text', min_text: 'Least text',
  default_na: 'N/A by default', requires_comment: 'Comment required',
  requires_photo: 'Photo required', min_rule: 'Minimum rule', section: 'Section',
}

const blank = (v) => v == null || String(v).trim() === ''
const cleanText = (v) => (blank(v) ? null : String(v).trim())

let counter = 0
const localId = () => `new-${(counter += 1)}`

export function blankCriterion() {
  return {
    key: null, _id: localId(), title: '', marks: 1, max_text: '', avg_text: '',
    min_text: '', default_na: false, requires_comment: false, requires_photo: false,
  }
}

// Gives every item an editor-only id (its key, or a fresh one) for React keys.
export function prepareTree(tree) {
  return {
    ...tree,
    sections: (tree.sections || []).map((s) => ({
      ...s,
      _id: s.key || localId(),
      criteria: (s.criteria || []).map((c) => ({ ...c, _id: c.key || localId() })),
    })),
  }
}

// First letter A-Z not used by a section yet.
export function nextSectionCode(tree) {
  const used = new Set(tree.sections.map((s) => s.code))
  for (let i = 0; i < 26; i += 1) {
    const letter = String.fromCharCode(65 + i)
    if (!used.has(letter)) return letter
  }
  return ''
}

const replaceAt = (list, index, value) => list.map((x, i) => (i === index ? value : x))
const removeAt = (list, index) => list.filter((_, i) => i !== index)

function moved(list, index, delta) {
  const target = index + delta
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list
  const copy = [...list]
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}

export function updateTool(tree, patch) {
  return { ...tree, ...patch }
}

export function addSection(tree) {
  const section = { key: null, _id: localId(), code: nextSectionCode(tree), name: '', criteria: [blankCriterion()] }
  return { ...tree, sections: [...tree.sections, section] }
}

export function removeSection(tree, s) {
  return { ...tree, sections: removeAt(tree.sections, s) }
}

export function moveSection(tree, s, delta) {
  return { ...tree, sections: moved(tree.sections, s, delta) }
}

export function updateSection(tree, s, patch) {
  return { ...tree, sections: replaceAt(tree.sections, s, { ...tree.sections[s], ...patch }) }
}

export function addCriterion(tree, s) {
  const sec = tree.sections[s]
  return updateSection(tree, s, { criteria: [...sec.criteria, blankCriterion()] })
}

export function removeCriterion(tree, s, c) {
  return updateSection(tree, s, { criteria: removeAt(tree.sections[s].criteria, c) })
}

export function moveCriterion(tree, s, c, delta) {
  return updateSection(tree, s, { criteria: moved(tree.sections[s].criteria, c, delta) })
}

export function updateCriterion(tree, s, c, patch) {
  const criteria = tree.sections[s].criteria
  return updateSection(tree, s, { criteria: replaceAt(criteria, c, { ...criteria[c], ...patch }) })
}

export function toNumber(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return NaN
}

// Marks must be above 0 in steps of 0.5.
export function marksOk(value) {
  const n = toNumber(value)
  return Number.isFinite(n) && n > 0 && Math.abs(n * 2 - Math.round(n * 2)) < 1e-9
}

export function totalMarks(tree) {
  let total = 0
  for (const s of tree.sections) {
    for (const c of s.criteria) {
      if (!c.default_na && marksOk(c.marks)) total += toNumber(c.marks)
    }
  }
  return total
}

// A cleaned copy as the server would store it: trimmed text, blank optional
// text -> null, marks as a number, editor-only fields dropped.
export function normalizeTree(tree) {
  return {
    code: tree.code,
    name: String(tree.name || '').trim(),
    min_rule: tree.min_rule || 'zero',
    sections: tree.sections.map((s) => ({
      key: s.key || null,
      code: blank(s.code) ? '' : String(s.code).trim(),
      name: String(s.name || '').trim(),
      criteria: s.criteria.map((c) => ({
        key: c.key || null,
        title: String(c.title || '').trim(),
        marks: toNumber(c.marks),
        max_text: cleanText(c.max_text),
        avg_text: cleanText(c.avg_text),
        min_text: cleanText(c.min_text),
        default_na: !!c.default_na,
        requires_comment: !!c.requires_comment,
        requires_photo: !!c.requires_photo,
      })),
    })),
  }
}

// Same rules as sop_versions.validate_tree. Each problem is
// { section: index|null, criterion: index|null, field, message, text } where
// `text` is the full sentence the server would send.
export function validateTree(tree) {
  const issues = []
  const add = (section, criterion, field, message, label) =>
    issues.push({ section, criterion, field, message, text: label ? `${label}: ${message}` : message })

  if (blank(tree.name)) add(null, null, 'name', 'Tool name is required')
  if (!['zero', 'third'].includes(tree.min_rule || 'zero')) {
    add(null, null, 'min_rule', "Minimum rule must be 'zero' or 'third'")
  }
  if (!tree.sections.length) add(null, null, 'sections', 'A tool needs at least one section')

  const codes = new Set()
  const sectionKeys = new Set()
  const criterionKeys = new Set()
  tree.sections.forEach((sec, s) => {
    const label = `Section ${sec.code || s + 1}`
    if (blank(sec.name)) add(s, null, 'name', 'name is required', label)
    const code = blank(sec.code) ? null : String(sec.code).trim()
    if (code !== null) {
      if (codes.has(code)) add(s, null, 'code', `section code ${code} is used twice`, label)
      codes.add(code)
    }
    if (sec.key) {
      if (sectionKeys.has(sec.key)) add(s, null, 'key', `section key ${sec.key} is used twice`, label)
      sectionKeys.add(sec.key)
    }
    if (!sec.criteria.length) add(s, null, 'criteria', 'add at least one question', label)
    sec.criteria.forEach((c, i) => {
      const where = `${label}, question ${i + 1}`
      if (blank(c.title)) add(s, i, 'title', 'question text is required', where)
      if (!marksOk(c.marks)) add(s, i, 'marks', 'marks must be above 0 in steps of 0.5', where)
      if (!c.default_na) {
        if (blank(c.max_text)) add(s, i, 'max_text', 'Best text is required', where)
        if (blank(c.min_text)) add(s, i, 'min_text', 'Least text is required', where)
      }
      if (c.key) {
        if (criterionKeys.has(c.key)) add(s, i, 'key', `question key ${c.key} is used twice`, where)
        criterionKeys.add(c.key)
      }
    })
  })
  return issues
}

// The messages for one item: issuesFor(issues, null, null) is the tool itself,
// (issues, s, null) a section, (issues, s, c) a question.
export function issuesFor(issues, section, criterion) {
  return issues.filter((i) => i.section === section && i.criterion === criterion)
}

const sectionLabel = (s) => `${s.code || '?'}. ${s.name || ''}`.trim()

function indexTree(tree) {
  const sections = new Map()
  const criteria = new Map()
  for (const s of tree.sections) {
    if (s.key) sections.set(s.key, s)
    for (const c of s.criteria) if (c.key) criteria.set(c.key, { section: s, criterion: c })
  }
  return { sections, criteria }
}

// Items present in both key lists whose position among the shared ones differs.
function movedItems(oldKeys, newKeys) {
  const shared = new Set(oldKeys.filter((k) => newKeys.includes(k)))
  const before = oldKeys.filter((k) => shared.has(k))
  const after = newKeys.filter((k) => shared.has(k))
  return after
    .map((k) => ({ key: k, from: before.indexOf(k) + 1, to: after.indexOf(k) + 1 }))
    .filter((m) => m.from !== m.to)
}

// What publishing `next` over `prev` changes (same shape as the server's
// diff_tree). Items match by key; a new item has no key (or an unknown one).
export function diffTrees(prev, next) {
  const a = normalizeTree(prev)
  const b = normalizeTree(next)
  const oldIdx = indexTree(a)
  const newIdx = indexTree(b)
  const added = []
  const removed = []
  const changed = []
  const reordered = []

  if (a.name !== b.name) {
    changed.push({ kind: 'tool', key: null, label: b.name, fields: [{ field: 'name', old: a.name, new: b.name }] })
  }
  if (a.min_rule !== b.min_rule) {
    changed.push({ kind: 'tool', key: null, label: b.name, fields: [{ field: 'min_rule', old: a.min_rule, new: b.min_rule }] })
  }

  for (const sec of b.sections) {
    const before = oldIdx.sections.get(sec.key)
    if (!before) {
      added.push({ kind: 'section', key: null, label: sectionLabel(sec) })
    } else {
      const fields = ['code', 'name']
        .filter((f) => before[f] !== sec[f])
        .map((f) => ({ field: f, old: before[f], new: sec[f] }))
      if (fields.length) changed.push({ kind: 'section', key: sec.key, label: sectionLabel(sec), fields })
    }
    for (const c of sec.criteria) {
      const was = oldIdx.criteria.get(c.key)
      if (!was) {
        added.push({ kind: 'criterion', key: null, label: c.title, section: sectionLabel(sec) })
        continue
      }
      const fields = CRITERION_FIELDS
        .filter((f) => was.criterion[f] !== c[f])
        .map((f) => ({ field: f, old: was.criterion[f], new: c[f] }))
      if (was.section.key !== sec.key) {
        fields.push({ field: 'section', old: sectionLabel(was.section), new: sectionLabel(sec) })
      }
      if (fields.length) {
        changed.push({ kind: 'criterion', key: c.key, label: c.title, section: sectionLabel(sec), fields })
      }
    }
  }

  for (const sec of a.sections) {
    if (!newIdx.sections.has(sec.key)) removed.push({ kind: 'section', key: sec.key, label: sectionLabel(sec) })
    for (const c of sec.criteria) {
      if (!newIdx.criteria.has(c.key)) {
        removed.push({ kind: 'criterion', key: c.key, label: c.title, section: sectionLabel(sec) })
      }
    }
  }

  const oldOrder = a.sections.filter((s) => s.key).map((s) => s.key)
  const newOrder = b.sections.filter((s) => oldIdx.sections.has(s.key)).map((s) => s.key)
  for (const m of movedItems(oldOrder, newOrder)) {
    reordered.push({ kind: 'section', label: sectionLabel(newIdx.sections.get(m.key)), ...m })
  }
  for (const sec of b.sections) {
    const prevSection = oldIdx.sections.get(sec.key)
    if (!prevSection) continue
    const before = prevSection.criteria.filter((c) => c.key).map((c) => c.key)
    const after = sec.criteria
      .filter((c) => oldIdx.criteria.get(c.key)?.section.key === sec.key)
      .map((c) => c.key)
    for (const m of movedItems(before, after)) {
      reordered.push({
        kind: 'criterion', label: newIdx.criteria.get(m.key).criterion.title,
        section: sectionLabel(sec), ...m,
      })
    }
  }

  const summary = { added: added.length, removed: removed.length, changed: changed.length, reordered: reordered.length }
  summary.total = summary.added + summary.removed + summary.changed + summary.reordered
  return { added, removed, changed, reordered, summary }
}

// What goes to POST /publish: the cleaned tree without the code (the URL has it).
export function toPayload(tree) {
  const { code, ...rest } = normalizeTree(tree)
  return rest
}

export const draftKey = (code, baseVersion) => `sop-editor:${code}@${baseVersion}`

// One readable line for a changed field, e.g. "Marks: 4 -> 5".
export function describeField(f) {
  const show = (v) => (v === null || v === undefined || v === '' ? '(empty)' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v))
  return `${FIELD_LABELS[f.field] || f.field}: ${show(f.old)} -> ${show(f.new)}`
}
