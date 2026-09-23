import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { clearSession, loadSession, saveSession } from './api/client'
import Layout from './components/Layout'
import RoleProtectedRoute from './components/RoleProtectedRoute'
import ToastProvider from './components/Toast'
import { firstAllowedPage } from './lib/rolesMap'
import Login from './pages/Login'

import Dashboard from './pages/Dashboard'
import StoreAuditScores from './pages/StoreAuditScores'
import Issues from './pages/Issues'
import AuditStatus from './pages/AuditStatus'
import Scheduling from './pages/Scheduling'
import Questions from './pages/Questions'
import Stores from './pages/Stores'
import Email from './pages/Email'
import AuditLog from './pages/AuditLog'

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

  const role = session.user?.role

  function guarded(page, element) {
    return (
      <RoleProtectedRoute role={role} page={page}>
        {element}
      </RoleProtectedRoute>
    )
  }

  return (
    <BrowserRouter>
      <ToastProvider>
        <Layout user={session.user} onLogout={handleLogout}>
          <Routes>
            <Route path="/" element={<Navigate to={`/${firstAllowedPage(role)}`} replace />} />
            <Route path="/dashboard" element={guarded('dashboard', <Dashboard />)} />
            <Route path="/scores" element={guarded('scores', <StoreAuditScores />)} />
            <Route path="/issues" element={guarded('issues', <Issues />)} />
            <Route path="/audits" element={guarded('audits', <AuditStatus />)} />
            <Route path="/scheduling" element={guarded('scheduling', <Scheduling />)} />
            <Route path="/questions" element={guarded('questions', <Questions />)} />
            <Route path="/stores" element={guarded('stores', <Stores />)} />
            <Route path="/email" element={guarded('email', <Email />)} />
            <Route path="/audit-log" element={guarded('audit-log', <AuditLog />)} />
            <Route path="*" element={<Navigate to={`/${firstAllowedPage(role)}`} replace />} />
          </Routes>
        </Layout>
      </ToastProvider>
    </BrowserRouter>
  )
}
