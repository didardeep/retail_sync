// Pure helpers for the Audit Checklist page (filtering, grouping, keys).

export function hit(value, q) {
  return String(value || '').toLowerCase().includes(q);
}

export function normQuery(search) {
  return String(search || '').trim().toLowerCase();
}

// Criterion matches on its title or any rubric text.
export function criterionMatches(c, q) {
  return !q || hit(c.title, q) || hit(c.max_text, q) || hit(c.avg_text, q) || hit(c.min_text, q);
}

// Keep tools/sections/criteria that match. A tool or section whose own name
// matches keeps all its children.
export function filterSopTools(tools, search) {
  const q = normQuery(search);
  if (!q) return tools;
  const out = [];
  for (const t of tools) {
    const toolHit = hit(t.name, q) || hit(t.code, q);
    const sections = [];
    for (const s of t.sections || []) {
      const secHit = toolHit || hit(s.name, q) || hit(s.code, q);
      const criteria = secHit ? s.criteria || [] : (s.criteria || []).filter(c => criterionMatches(c, q));
      if (criteria.length) sections.push({ ...s, criteria });
    }
    if (sections.length) out.push({ ...t, sections });
  }
  return out;
}

export function sopKeys(tools) {
  const keys = [];
  for (const t of tools) {
    keys.push('t:' + t.id);
    for (const s of t.sections || []) {
      keys.push('s:' + s.id);
      for (const c of s.criteria || []) keys.push('c:' + c.id);
    }
  }
  return keys;
}

// Only approved, active questions; answer_type is optional and left as is.
export function visibleQuestions(questions) {
  return (questions || []).filter(
    q => q.active !== false && (q.approval_status == null || q.approval_status === 'APPROVED')
  );
}

// Returns [{ proc, total, subs: [{ sp, items }] }] filtered by the search.
export function groupQuestions(questions, search) {
  const q = normQuery(search);
  const map = new Map();
  for (const qu of questions) {
    if (q && !(hit(qu.text, q) || hit(qu.process, q) || hit(qu.sub_process || qu.sp, q) || hit(qu.guidance, q))) continue;
    const proc = qu.process || 'General';
    const sp = qu.sub_process || qu.sp || 'General';
    if (!map.has(proc)) map.set(proc, new Map());
    const subs = map.get(proc);
    if (!subs.has(sp)) subs.set(sp, []);
    subs.get(sp).push(qu);
  }
  return [...map].map(([proc, subs]) => ({
    proc,
    total: [...subs.values()].reduce((n, a) => n + a.length, 0),
    subs: [...subs].map(([sp, items]) => ({ sp, items })),
  }));
}

export function classicKeys(groups) {
  return groups.map(g => 'p:' + g.proc);
}
