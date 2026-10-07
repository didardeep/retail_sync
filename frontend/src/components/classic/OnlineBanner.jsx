import { WifiOff } from 'lucide-react';

import { Button } from '@/components/ui/button';

// Classic audits are online only. Shown when the device is offline or the last
// save failed; Retry re-sends the unsaved change.
export default function OnlineBanner({ online, failed, onRetry, retrying }) {
  if (online && !failed) return null;
  return (
    <div
      role="alert"
      className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
    >
      <WifiOff className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        You need a connection for checklist audits; your last answer was not saved.
        {failed?.message && !failed.offline && (
          <div className="mt-0.5 text-xs text-red-800">{failed.message}</div>
        )}
      </div>
      {failed && (
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" disabled={retrying} onClick={onRetry}>
          {retrying ? 'Retrying...' : 'Retry'}
        </Button>
      )}
    </div>
  );
}
