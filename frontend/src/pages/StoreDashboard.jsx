import { useCallback, useEffect, useState } from 'react';

import { api, loadSession } from '@/api/client';
import { Loading } from '@/components/Loader';
import { StoreView } from '@/components/store-dashboard/StoreView';
import { Button } from '@/components/ui/button';

// My Store: the store manager's own store (the API only returns that store, so
// there is no picker). Admin and Audit Manager use Dashboard & Analytics with
// its store selector instead (App.jsx redirects /my-store to /dashboard for them).
export default function StoreDashboard() {
  const role = loadSession()?.user?.role;
  const [state, setState] = useState({ status: 'loading', error: null, store: null });

  const load = useCallback(async () => {
    setState({ status: 'loading', error: null, store: null });
    try {
      const stores = await api.stores();
      setState({ status: 'ready', error: null, store: (stores || [])[0] || null });
    } catch (e) {
      setState({ status: 'error', error: e, store: null });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (state.status === 'loading') return <Loading what="your store" />;

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 text-[15px] font-bold text-foreground">My Store</div>
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            {state.error?.message || 'Could not load your store.'}
          </p>
          <Button onClick={load}>Retry</Button>
        </div>
      </div>
    );
  }

  const { store } = state;
  if (!store) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">No store assigned to your account.</div>;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-foreground">My Store</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {store.name}{store.city ? `, ${store.city}` : ''}{store.region ? ` - ${store.region}` : ''}
        </p>
      </div>
      <StoreView store={store} role={role} />
    </div>
  );
}
