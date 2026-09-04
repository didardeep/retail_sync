import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { clearSession, loadSession, saveSession } from './api/client'
import Layout from './components/Layout'
import ToastProvider from './components/Toast'
import Login from './pages/Login'

import Dashboard from './pages/Dashboard'
import StoreAuditScores from './pages/StoreAuditScores'
import Issues from './pages/Issues'
import AuditStatus from './pages/AuditStatus'
import Scheduling from './pages/Scheduling'
import Questions from './pages/Questions'
import Stores from './pages/Stores'
import Email from './pages/Email'

export default function App() {
  const [session, setSession] = useState(loadSession())

  function handleLogin(result) {
    saveSession(result)
    setSession(result)
  }

  function handleLogout() {
    clearSession()
    setSession(null)
  }

  if (!session) return <Login onLogin={handleLogin} />

  return (
    <BrowserRouter>
      <ToastProvider>
        <Layout user={session.user} onLogout={handleLogout}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/scores" element={<StoreAuditScores />} />
            <Route path="/issues" element={<Issues />} />
            <Route path="/audits" element={<AuditStatus />} />
            <Route path="/scheduling" element={<Scheduling />} />
            <Route path="/questions" element={<Questions />} />
            <Route path="/stores" element={<Stores />} />
            <Route path="/email" element={<Email />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout>
      </ToastProvider>
    </BrowserRouter>
  )
}
