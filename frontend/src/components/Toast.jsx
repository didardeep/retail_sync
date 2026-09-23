import { toast as sonnerToast } from 'sonner';

import { Toaster } from '@/components/ui/sonner';

export function useToast() {
  return sonnerToast;
}

export default function ToastProvider({ children }) {
  return (
    <>
      {children}
      <Toaster position="bottom-right" />
    </>
  );
}
