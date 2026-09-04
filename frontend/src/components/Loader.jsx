export function Loading({ what = 'data' }) {
  return <div className="empty">Loading {what}…</div>
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function ErrorNote({ error }) {
  if (!error) return null
  return <p className="error">{String(error.message || error)}</p>
}
