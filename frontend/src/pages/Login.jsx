import { useState } from 'react'
import { api } from '../api/client'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <div className="login-split">
      {/* ── Left branding panel ── */}
      <div className="login-brand">
        <div className="login-brand-inner">
          {/* Logo mark */}
          <div className="login-logo">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              <rect width="56" height="56" rx="14" fill="rgba(255,255,255,0.15)"/>
              <path d="M16 28L24 20L32 28L24 36Z" fill="#fff"/>
              <path d="M24 28L32 20L40 28L32 36Z" fill="rgba(255,255,255,0.6)"/>
            </svg>
          </div>

          <h1 className="login-brand-title">Retail Sync</h1>
          <p className="login-brand-sub">Audit Management Platform</p>

          <div className="login-brand-divider"/>

          <div className="login-features">
            <div className="login-feature">
              <span className="login-feature-icon">&#x1F50D;</span>
              <div>
                <strong>Smart Audits</strong>
                <span>Automated scheduling, execution & scoring</span>
              </div>
            </div>
            <div className="login-feature">
              <span className="login-feature-icon">&#x1F4CA;</span>
              <div>
                <strong>Real-time Analytics</strong>
                <span>Quarterly trends, risk heatmaps & Power BI</span>
              </div>
            </div>
            <div className="login-feature">
              <span className="login-feature-icon">&#x1F3EA;</span>
              <div>
                <strong>Store Intelligence</strong>
                <span>40+ KPIs across all retail locations</span>
              </div>
            </div>
            <div className="login-feature">
              <span className="login-feature-icon">&#x26A1;</span>
              <div>
                <strong>Issue Tracking</strong>
                <span>Auto-raised actions with SLA monitoring</span>
              </div>
            </div>
          </div>

          <div className="login-brand-footer">
            &copy; 2026 Retail Sync &bull; Powered by KPMG
          </div>
        </div>
      </div>

      {/* ── Right login form ── */}
      <div className="login-form-side">
        <form className="login-card" onSubmit={submit}>
          <div className="login-card-header">
            <h2>Welcome back</h2>
            <p>Sign in to your account to continue</p>
          </div>

          <label className="login-field">
            <span>Email address</span>
            <div className="login-input-wrap">
              <span className="login-input-icon">&#x2709;</span>
              <input
                type="email"
                placeholder="name@retail-chain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </label>

          <label className="login-field">
            <span>Password</span>
            <div className="login-input-wrap">
              <span className="login-input-icon">&#x1F512;</span>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          </label>

          {error && <div className="login-error">{error}</div>}

          <button className="login-btn" type="submit" disabled={busy}>
            {busy ? (
              <span className="login-spinner"/>
            ) : null}
            {busy ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="login-hint">
            <div className="login-hint-title">Demo Credentials</div>
            <div className="login-hint-row">
              <span className="login-hint-badge am">AM</span>
              <div>
                <div className="login-hint-email">am@retail-chain.com</div>
                <div className="login-hint-role">Audit Manager</div>
              </div>
            </div>
            <div className="login-hint-row">
              <span className="login-hint-badge aud">AU</span>
              <div>
                <div className="login-hint-email">aud.j.patel@retail-chain.com</div>
                <div className="login-hint-role">Auditor</div>
              </div>
            </div>
            <div className="login-hint-row">
              <span className="login-hint-badge sm">SM</span>
              <div>
                <div className="login-hint-email">sm.deepak.tiwari@retail-chain.com</div>
                <div className="login-hint-role">Store Manager</div>
              </div>
            </div>
            <div className="login-hint-pw">Password for all: <code>password123</code></div>
          </div>
        </form>
      </div>
    </div>
  )
}
