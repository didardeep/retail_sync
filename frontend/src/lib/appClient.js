// The Android app is for auditors only. Inside the app (a Capacitor shell around
// this same website) every request carries X-App-Client: auditor-app, and the
// server refuses anyone who is not an auditor (backend/app/auth.py). The website
// sends no header and is unaffected. The checks here only give a friendly
// message and hide other roles' screens; the server is the real boundary.

export const APP_CLIENT_HEADER = 'X-App-Client'
export const AUDITOR_APP = 'auditor-app'
export const AUDITOR_APP_ONLY_MESSAGE = 'This app is for auditors. Please use the website.'

// Capacitor puts itself on window when the page runs inside the Android app.
export function isAuditorApp() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()
}

export function appHeaders(native = isAuditorApp()) {
  return native ? { [APP_CLIENT_HEADER]: AUDITOR_APP } : {}
}

// May this role stay signed in here? Everyone on the website; only auditors in the app.
export function allowedInThisApp(role, native = isAuditorApp()) {
  return !native || role === 'AUDITOR'
}
