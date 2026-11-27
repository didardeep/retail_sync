import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

import { questionsApi } from '@/api/questionsApi';
import { Drawer } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, formatTime } from '@/lib/auditRows';
import { authorOf, changeSummary, compareVersions } from '@/lib/questionVersions';
import { cn, fieldClass, labelClass } from '@/lib/utils';

// The audits that used one version, loaded when its row is opened.
function VersionAudits({ id }) {
  const navigate = useNavigate();
  const [audits, setAudits] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    questionsApi.versionAudits(id).then(setAudits).catch((e) => setError(e.message || 'Could not load audits'));
  }, [id]);
  if (error) return <div className="px-3 pb-2 text-xs text-destructive">{error}</div>;
  if (!audits) return <div className="px-3 pb-2 text-xs text-muted-foreground">Loading audits...</div>;
  const stores = new Set(audits.map((a) => a.store_id)).size;
  return (
    <div className="px-3 pb-2">
      <div className="mb-1 text-[11px] text-muted-foreground">
        {audits.length} {audits.length === 1 ? 'audit' : 'audits'} across {stores} {stores === 1 ? 'store' : 'stores'}
      </div>
      <div className="max-h-48 overflow-y-auto rounded-md border border-border">
        {audits.map((a) => (
          <button
            key={a.id}
            type="button"
            className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-border px-2.5 py-1.5 text-left text-[11.5px] last:border-0 hover:bg-muted/50"
            onClick={() => navigate(`/audits/${a.id}/approve`)}
          >
            <span className="font-semibold">{a.id}</span>
            <span className="truncate text-muted-foreground">{a.store || a.store_id}{a.scheduled_at ? ` | ${formatDate(a.scheduled_at)}` : ''}</span>
            <span className="text-muted-foreground">{a.status}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// One question's version history: who saved each version, when, why and what
// changed; the audits that used it; a compare of any two; and restore.
export default function VersionPanel({ code, onClose, onRestored }) {
  const toast = useToast();
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({});            // version id -> audits list shown
  const [pair, setPair] = useState({ a: '', b: '' }); // compare: older, newer (ids)
  const [restoring, setRestoring] = useState(null); // { version, note }
  const [busy, setBusy] = useState(false);

  function load() {
    setError('');
    questionsApi.versions(code).then((list) => {
      setVersions(list);
      // Start by comparing the current version with the one before it.
      setPair({ a: list[1]?.id || list[0]?.id || '', b: list[0]?.id || '' });
    }).catch((e) => setError(e.message || 'Could not load the history'));
  }

  useEffect(() => {
    if (!code) return;
    setVersions(null);
    setOpen({});
    setRestoring(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function restore() {
    setBusy(true);
    try {
      const saved = await questionsApi.restore(restoring.version.id, restoring.note);
      toast(`v${restoring.version.version} restored as v${saved.version}`);
      setRestoring(null);
      onRestored?.(saved);
      load();
    } catch (e) {
      toast.error(e.message || 'Could not restore this version');
    } finally {
      setBusy(false);
    }
  }

  const current = versions?.[0];
  const byId = new Map((versions || []).map((v) => [v.id, v]));
  const rows = pair.a && pair.b && byId.get(pair.a) && byId.get(pair.b)
    ? compareVersions(byId.get(pair.a), byId.get(pair.b)) : [];
  const anyChange = rows.some((r) => r.changed);

  return (
    <Drawer open={!!code} onClose={onClose} className="w-[640px]">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Version history</div>
        <button type="button" className="text-[15px] text-muted-foreground" onClick={onClose} aria-label="Close">&times;</button>
      </div>
      <div className="mb-4">
        <div className="text-base font-bold text-foreground">{code}{current ? ` - v${current.version}` : ''}</div>
        {current && <div className="text-[12.5px] text-foreground/80">{current.text}</div>}
      </div>

      {error && <div className="mb-3 text-xs text-destructive">{error}</div>}
      {!versions && !error && <div className="text-xs text-muted-foreground">Loading history...</div>}

      {versions && (
        <>
          <div className="mb-4 overflow-hidden rounded-lg border border-border">
            {versions.map((v) => (
              <div key={v.id} className="border-b border-border last:border-0">
                <div className="flex items-start gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                      <span className="font-bold">v{v.version}</span>
                      {v.is_current && <Badge className="border-transparent bg-primary px-1.5 py-0 text-[10px] text-primary-foreground">Current</Badge>}
                      <span className="text-muted-foreground">{authorOf(v)}{v.created_at ? ` | ${formatDate(v.created_at)}, ${formatTime(v.created_at)}` : ''}</span>
                    </div>
                    {v.change_note && <div className="mt-0.5 text-[12px] italic text-foreground/80">"{v.change_note}"</div>}
                    <div className="mt-0.5 text-[11px] text-muted-foreground">Changed: {changeSummary(v)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] text-primary hover:bg-muted disabled:text-muted-foreground"
                      disabled={!v.audit_count}
                      onClick={() => setOpen((o) => ({ ...o, [v.id]: !o[v.id] }))}
                      aria-expanded={!!open[v.id]}
                    >
                      {v.audit_count ? (open[v.id] ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />) : null}
                      {v.audit_count} {v.audit_count === 1 ? 'audit' : 'audits'}
                    </button>
                    {!v.is_current && (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setRestoring({ version: v, note: '' })}>
                        <RotateCcw className="size-3" /> Restore
                      </Button>
                    )}
                  </div>
                </div>
                {open[v.id] && <VersionAudits id={v.id} />}
                {restoring?.version.id === v.id && (
                  <div className="border-t border-border bg-muted/40 px-3 py-2.5">
                    <label className={labelClass} htmlFor="restore-note">Reason for restoring (optional)</label>
                    <input
                      id="restore-note"
                      className={fieldClass}
                      placeholder={`Restored from v${v.version}`}
                      value={restoring.note}
                      onChange={(e) => setRestoring((r) => ({ ...r, note: e.target.value }))}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      v{v.version}'s content is saved as a new version. Nothing is deleted, and new audits use it from now on.
                    </p>
                    <div className="mt-2 flex justify-end gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setRestoring(null)}>Cancel</Button>
                      <Button size="sm" disabled={busy} onClick={restore}>Restore v{v.version}</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {versions.length > 1 && (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="font-semibold">Compare</span>
                <select className={cn(fieldClass, 'w-auto')} value={pair.a} onChange={(e) => setPair((p) => ({ ...p, a: e.target.value }))} aria-label="Older version">
                  {versions.map((v) => <option key={v.id} value={v.id}>v{v.version}</option>)}
                </select>
                <span className="text-muted-foreground">with</span>
                <select className={cn(fieldClass, 'w-auto')} value={pair.b} onChange={(e) => setPair((p) => ({ ...p, b: e.target.value }))} aria-label="Newer version">
                  {versions.map((v) => <option key={v.id} value={v.id}>v{v.version}</option>)}
                </select>
              </div>
              {!anyChange && <div className="mb-2 text-xs text-muted-foreground">These two versions have the same content.</div>}
              <div className="overflow-hidden rounded-lg border border-border">
                {rows.filter((r) => r.changed || r.field === 'text').map((r) => (
                  <div key={r.field} className="grid grid-cols-[110px_1fr_1fr] gap-2 border-b border-border px-3 py-2 text-[12px] last:border-0">
                    <div className="font-semibold text-muted-foreground">{r.label}</div>
                    {r.changed ? (
                      <>
                        <div className="rounded bg-red-50 px-1.5 py-0.5 text-red-900 line-through decoration-red-300">{r.before}</div>
                        <div className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-900">{r.after}</div>
                      </>
                    ) : (
                      <div className="col-span-2 text-muted-foreground">{r.after} (unchanged)</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
