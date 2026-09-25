// Tailwind class strings, one constant per "badge color" the app used to
// express as a CSS class suffix (bg/bo/bb/br/by/bgr/bpu). Centralising the
// mapping here means every page that already calls sBadge/prC/stC picks up
// the Tailwind styling automatically once its call site swaps a <span
// className="badge ..."> for <Badge className={...}>.
export const BADGE = {
  green: 'bg-emerald-50 text-emerald-700',
  orange: 'bg-orange-50 text-orange-800',
  blue: 'bg-sky-50 text-sky-700',
  red: 'bg-red-50 text-red-800',
  yellow: 'bg-yellow-50 text-yellow-900',
  gray: 'bg-muted text-muted-foreground border border-border',
  purple: 'bg-violet-100 text-violet-700',
};

const avCols = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500', 'bg-violet-500', 'bg-cyan-500'];
export function avC(name) {
  if (!name) return avCols[0];
  return avCols[Math.abs([...name].reduce((a,c) => a + c.charCodeAt(0), 0)) % avCols.length];
}
export function wColor(w) { return w >= 5 ? '#e02424' : w >= 4 ? '#f59e0b' : '#0e9f6e'; }
export function sColor(v) { return v >= 80 ? '#0e9f6e' : v >= 60 ? '#f59e0b' : '#e02424'; }
export function sBadge(s) {
  if (s === 'In Progress' || s === 'Ongoing') return BADGE.blue;
  if (s === 'Planned' || s === 'Assigned') return BADGE.gray;
  if (s === 'Overdue') return BADGE.red;
  if (s === 'Completed' || s === 'Approved') return BADGE.green;
  if (s === 'Scheduled') return BADGE.purple;
  return BADGE.gray;
}
export function pbClass(v) { return v >= 80 ? 'bg-emerald-500' : v >= 60 ? 'bg-amber-500' : 'bg-red-500'; }
export function prC(p) { return p === 'Critical' ? BADGE.red : p === 'High' ? BADGE.orange : p === 'Medium' ? BADGE.yellow : BADGE.gray; }
export function stC(s) {
  return s === 'In Progress' ? BADGE.blue : s === 'Resolved' ? BADGE.green : s === 'On Hold' ? BADGE.yellow : s === 'Closed' ? BADGE.gray : BADGE.red;
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
