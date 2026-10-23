// Pure helpers for the Audit Checklist page (filtering, grouping, keys).

export function hit(value, q) {
  return String(value || '').toLowerCase().includes(q);
}

export function normQuery(search) {
  return String(search || '').trim().toLowerCase();
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
