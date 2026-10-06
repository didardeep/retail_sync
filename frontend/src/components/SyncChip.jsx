import { RefreshCw, WifiOff } from 'lucide-react';

import { cn } from '@/lib/utils';
import { syncNow, useOnline, useSyncState } from '@/lib/offline';

// One-glance answer to "is my work safe?": Saved on device / Syncing /
// Synced / Offline (FR-3.8).
function describe(sync, online) {
  if (sync.status === 'syncing') return { text: 'Syncing...', tone: 'info' };
  if (sync.status === 'auth') return { text: 'Sign in again to sync', tone: 'warn' };
  if (sync.errors > 0) return { text: 'Needs attention', tone: 'bad' };
  if (!online || sync.status === 'offline') {
    return {
      text: sync.pending > 0 ? `Offline - ${sync.pending} saved on device` : 'Offline',
      tone: 'warn',
    };
  }
  if (sync.status === 'error') return { text: 'Sync failed, will retry', tone: 'bad' };
  if (sync.pending > 0) return { text: 'Saved on device', tone: 'info' };
  return { text: 'Synced', tone: 'ok' };
}

const TONES = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  warn: 'bg-amber-50 text-amber-900 border-amber-200',
  bad: 'bg-red-50 text-red-800 border-red-200',
};

export default function SyncChip({ className }) {
  const sync = useSyncState();
  const online = useOnline();
  const { text, tone } = describe(sync, online);
  return (
    <button
      type="button"
      onClick={() => syncNow({ refresh: true }).catch(() => {})}
      disabled={!online}
      title="Tap to sync now"
      className={cn(
        'inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {!online ? <WifiOff className="size-3.5" /> : (
        <RefreshCw className={cn('size-3.5', sync.status === 'syncing' && 'animate-spin')} />
      )}
      {text}
    </button>
  );
}
