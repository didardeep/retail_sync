// When the server says 401 to a request that carried a login token, that token
// has expired (they last 12 hours) or the account was switched off. The app
// listens for this event and sends the person back to the sign-in screen
// instead of leaving them on a normal-looking page where nothing loads.
//
// Only the login token is cleared. Audits not yet sent stay on the phone and
// sync after signing in again (src/lib/offlineQueue.js treats 401 as "auth",
// never as "rejected").

export const SESSION_EXPIRED_EVENT = 'rs:session-expired'

// A wrong password is also a 401 but carries no token, so it never counts.
export function isSessionExpiry(status, hadToken, path) {
  return status === 401 && !!hadToken && path !== '/auth/login'
}

// Several requests fail together, so the event fires several times. Only the
// first still finds the session; the later ones must not erase who it was.
export function whoExpired(previous, sessionUserId) {
  return sessionUserId || previous || null
}

// After signing in again: carry on where they were only if it is the same
// person. Anyone else starts at their own home page.
export function shouldResume(expiredFor, userId) {
  return !!expiredFor && expiredFor === userId
}

export function announceExpiredSession(target = globalThis.window) {
  target?.dispatchEvent?.(new Event(SESSION_EXPIRED_EVENT))
}
