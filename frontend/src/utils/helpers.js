const avCols = ['aa','ab','ac','ad','ae','af'];
export function avC(name) {
  if (!name) return avCols[0];
  return avCols[Math.abs([...name].reduce((a,c) => a + c.charCodeAt(0), 0)) % avCols.length];
}
export function wColor(w) { return w >= 5 ? '#e02424' : w >= 4 ? '#f59e0b' : '#0e9f6e'; }
export function sColor(v) { return v >= 80 ? '#0e9f6e' : v >= 60 ? '#f59e0b' : '#e02424'; }
export function sBadge(s) {
  if (s === 'In Progress' || s === 'Ongoing') return 'bb';
  if (s === 'Planned' || s === 'Assigned') return 'bgr';
  if (s === 'Overdue') return 'br';
  if (s === 'Completed' || s === 'Approved') return 'bg';
  if (s === 'Scheduled') return 'bpu';
  return 'bgr';
}
export function pbClass(v) { return v >= 80 ? 'pg' : v >= 60 ? 'po' : 'pr'; }
export function prC(p) { return p === 'Critical' ? 'br' : p === 'High' ? 'bo' : p === 'Medium' ? 'by' : 'bgr'; }
export function stC(s) {
  return s === 'In Progress' ? 'bb' : s === 'Resolved' ? 'bg' : s === 'On Hold' ? 'by' : s === 'Closed' ? 'bgr' : 'br';
}
export function qTypeLabel(at) {
  const a = (at || '').toLowerCase();
  if (a.includes('unstructured')) return 'Unstructured data analysis';
  if (a.includes('structured')) return 'Structured data analysis';
  if (a.includes('store visit')) return 'Store Visit';
  return at;
}
export function delta(curr, prev) {
  if (prev === undefined || prev === null) return null;
  return curr - prev;
}
export function fmtLocalDT(d) {
  const dt = new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
export function exportCSV(rows, headers, filename) {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
export function seedRand(seed) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return () => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 8) / 0xFFFFFF; };
}
