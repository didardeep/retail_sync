import { useState } from 'react'
import { api } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-[#0d2c5c] to-[#00338D] p-5">
      <form
        onSubmit={submit}
        className="w-full max-w-[380px] rounded-2xl bg-card p-[34px] text-card-foreground"
      >
        <h1 className="mb-1.5 text-xl font-semibold">Store Audit &amp; Analysis</h1>
        <p className="mb-[22px] text-sm text-muted-foreground">Sign in to continue</p>
        <label className="mb-3 block">
          <span className="mb-1 block text-[12.5px] text-muted-foreground">Email</span>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-[12.5px] text-muted-foreground">Password</span>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="mt-3 w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <div className="mt-[18px] text-xs leading-[1.7] text-muted-foreground">
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
