import { RefreshCw, WifiOff } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useOnline } from '@/lib/useOnline';
import { syncNow, useSyncState } from '@/lib/offlineSync';
import { syncSummary } from '@/lib/offlineQueue';

const TONES = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  warn: 'bg-amber-50 text-amber-900 border-amber-200',
  bad: 'bg-red-50 text-red-800 border-red-200',
};

// One-glance answer to "is my work safe?": Online / Offline / N changes
// waiting / Syncing / Conflict. Tap to sync now.
export default function SyncChip({ auditId, className }) {
  const sync = useSyncState();
  const online = useOnline();
  const { label, tone, state } = syncSummary({
    online,
    pending: sync.pending,
    syncing: sync.syncing,
    conflict: auditId ? !!sync.conflicts[auditId] : Object.keys(sync.conflicts).length > 0,
    auth: sync.auth,
    failing: sync.failing,
  });
  return (
    <button
      type="button"
      onClick={() => syncNow()}
      disabled={!online}
      title="Tap to sync now"
      data-sync-state={state}
      className={cn(
        'inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {!online ? <WifiOff className="size-3.5" /> : (
        <RefreshCw className={cn('size-3.5', sync.syncing && 'animate-spin')} />
      )}
      {label}
    </button>
  );
}
