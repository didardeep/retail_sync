import { WifiOff } from 'lucide-react';

// Shown while the device is offline, or when a change could not be stored on
// the device. Answers and remarks keep working offline; evidence and issues do not.
export default function OnlineBanner({ online, saveError }) {
  if (online && !saveError) return null;
  return (
    <div
      role="alert"
      className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <WifiOff className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {saveError
          ? `Your last change could not be saved on this device: ${saveError}`
          : 'You are offline. Answers and remarks are saved on this device and will sync when you are back online. Evidence uploads and raising issues need a connection.'}
      </div>
    </div>
  );
}
