// Sync engine for offline checklist audits: opens an audit from the server or
// from this device, and sends queued answers to the server one by one.
// The pure rules live in offlineQueue.js; the IndexedDB calls in offlineStore.js.
import { useSyncExternalStore } from 'react';

import { api } from '@/api/client';
import {
  cacheAudit, discardLocal, getCachedAudit, listConflicts, listQueue, recordChange,
  removeCachedAudit, removeEntryIfUnchanged, setConflict,
} from './offlineStore';
import { classifyError, nextEntry, reconcile, retryDelay } from './offlineQueue';
import { isAuditorEditable } from './statuses';

let state = { syncing: false, pending: 0, conflicts: {}, auth: false, failing: false };
const listeners = new Set();
let running = null;
let again = false;
let attempts = 0;
let timer = null;
let installed = false;

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

// Re-read the counters from IndexedDB.
async function refresh() {
  try {
    const [queue, conflicts] = await Promise.all([listQueue(), listConflicts()]);
    setState({
      pending: queue.length,
      conflicts: Object.fromEntries(conflicts.map((c) => [c.audit_id, c.message])),
    });
  } catch {
    // IndexedDB unavailable: leave the last known state.
  }
}

export function useSyncState() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
  );
}

async function run() {
  const blocked = (await listConflicts()).map((c) => c.audit_id);
  setState({ syncing: true });
  try {
    for (;;) {
      const entry = nextEntry(await listQueue(), blocked);
      if (!entry) break;
      try {
        await api.answer(entry.audit_id, entry.resp_id, entry.patch);
        await removeEntryIfUnchanged(entry);
        attempts = 0;
        setState({ auth: false, failing: false });
      } catch (e) {
        const c = classifyError(e);
        if (c.kind === 'conflict') {
          await setConflict(entry.audit_id, { message: c.message });
          blocked.push(entry.audit_id);
        } else if (c.kind === 'auth') {
          setState({ auth: true });
          break;
        } else if (c.kind === 'retry') {
          setState({ failing: true });
          scheduleRetry();
          break;
        } else {
          break;
        }
      }
    }
  } finally {
    setState({ syncing: false });
    await refresh();
  }
}

function scheduleRetry() {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), retryDelay(attempts));
  attempts += 1;
}

// Send everything that is waiting. One run at a time; a call made during a run
// makes it go round once more so a late change is not missed.
export function syncNow() {
  if (!navigator.onLine) return refresh();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await run();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

// Sync on the browser 'online' event and once at start. Safe to call twice.
export function installAutoSync() {
  if (installed) return;
  installed = true;
  window.addEventListener('online', () => { attempts = 0; syncNow(); });
  window.addEventListener('offline', () => setState({}));
  refresh().then(syncNow);
}

// Write one change on the device first, then try to send it.
export async function saveChange(auditId, respId, patch) {
  await recordChange(auditId, respId, patch);
  await refresh();
  syncNow();
}

// Sync, then report whether this audit has nothing left unsent.
export async function flushAudit(auditId) {
  await syncNow();
  const queue = await listQueue();
  const conflicts = await listConflicts();
  return {
    pending: queue.filter((e) => e.audit_id === auditId).length,
    conflict: conflicts.some((c) => c.audit_id === auditId),
  };
}

// Open an audit for the wizard or the review screen. From the server when
// reachable (with this device's unsent changes laid over it), otherwise the
// copy stored on this device. Returns { audit, fromDevice, conflict }.
export async function loadAudit(id) {
  const [cached, queue, conflicts] = await Promise.all([getCachedAudit(id), listQueue(), listConflicts()]);
  const known = conflicts.find((c) => c.audit_id === id);
  let server = null;
  if (!known) {
    try {
      server = await api.audit(id);
    } catch (e) {
      if (!e.offline && e.status) throw e;
      if (!cached) throw new Error('You are offline and this audit is not saved on this device. Open it once while online.');
    }
  }
  if (known) {
    return { audit: reconcile({ server: null, cached, entries: queue }).audit, fromDevice: true, conflict: known.message };
  }
  const { audit, conflict } = reconcile({ server, cached, entries: queue });
  if (conflict) {
    await setConflict(id, { message: conflict.message });
  } else if (server) {
    if (isAuditorEditable(server.status)) await cacheAudit(audit);
    else await removeCachedAudit(id);
  }
  await refresh();
  return { audit, fromDevice: !server, conflict: conflict?.message || null };
}

// Store the audits an auditor can still edit so they open without a network.
export async function prefetchAudits(audits) {
  for (const a of audits.slice(0, 10)) {
    try {
      await loadAudit(a.id);
    } catch {
      // Best effort: the audit can still be opened online.
    }
  }
}

// The auditor accepted the server's version of a conflicted audit.
export async function dismissConflict(id) {
  await discardLocal(id);
  await refresh();
}

// After a successful submit nothing of this audit is needed on the device.
export async function forgetAudit(id) {
  await removeCachedAudit(id);
  await refresh();
}
