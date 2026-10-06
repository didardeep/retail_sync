import { useSyncExternalStore } from 'react'

import { getSyncState, subscribeSync } from './sync'

export function useSyncState() {
  return useSyncExternalStore(subscribeSync, getSyncState)
}

function subscribeOnline(callback) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine)
}
