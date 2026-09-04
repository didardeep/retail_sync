import { useState } from 'react'
import { api } from '../api/client'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('am@retail-chain.com')
  const [password, setPassword] = useState('password123')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onLogin(await api.login(email, password))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Store Audit &amp; Analysis</h1>
        <p>Sign in to continue</p>
        <label className="field">
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="hint">
          Seeded accounts (password123):
          <br />
          am@retail-chain.com — Audit Manager
          <br />
          aud.a.sharma@retail-chain.com — Auditor
          <br />
          sm.a.sharma@retail-chain.com — Store Manager
        </div>
      </form>
    </div>
  )
}
