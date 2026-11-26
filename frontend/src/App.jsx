import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { clearSession, loadSession, saveSession } from './api/client'
import Layout from './components/Layout'
import RoleProtectedRoute from './components/RoleProtectedRoute'
import ToastProvider from './components/Toast'
import { allowedInThisApp } from './lib/appClient'
import { firstAllowedPage } from './lib/rolesMap'
import { SESSION_EXPIRED_EVENT, shouldResume, whoExpired } from './lib/sessionExpiry'
import Login from './pages/Login'

import Dashboard from './pages/Dashboard'
import AuditorDashboard from './pages/AuditorDashboard'
import StoreAuditScores from './pages/StoreAuditScores'
import Issues from './pages/Issues'
import Audit from './pages/Audit'
import Questions from './pages/Questions'
import PendingApprovals from './pages/PendingApprovals'
import Stores from './pages/Stores'
import Email from './pages/Email'
import AuditLog from './pages/AuditLog'
import StoreDashboard from './pages/StoreDashboard'
import UserManagement from './pages/UserManagement'
import AuditRoute from './components/classic/AuditRoute'
import ClassicAuditReview from './pages/ClassicAuditReview'
import AuditApproval from './pages/AuditApproval'

// Old My Store bookmarks and links (/my-store?store=<id>) open the Dashboard
// store view for admin and Audit Manager; the ?store key is kept.
function MyStoreRedirect() {
  const { search } = useLocation()
  const store = new URLSearchParams(search).get('store')
  return <Navigate to={store ? `/dashboard?store=${encodeURIComponent(store)}` : '/dashboard'} replace />
}

// Scheduling is part of the Audit page now; old /scheduling links keep their
// query (stage, auditor, id; new=1 opens the schedule form).
function SchedulingRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/audits${search}`} replace />
}

export default function App() {
  const [session, setSession] = useState(() => {
    const saved = loadSession()
    // A login left over from another role cannot stay in the auditor-only app.
    if (saved && !allowedInThisApp(saved.user?.role)) {
      clearSession()
      return null
    }
    return saved
  })
  const [notice, setNotice] = useState('')
  // Who was signed in when the login expired, so the same person can carry on.
  const expiredFor = useRef(null)

  useEffect(() => {
    function onExpired() {
      expiredFor.current = whoExpired(expiredFor.current, loadSession()?.user?.id)
      clearSession() // only the token; audits not yet sent stay on the phone
      setSession(null)
      setNotice('Your session expired. Please sign in again. Anything not yet sent is still saved on this phone.')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  function handleLogin(result) {
    // The same person signing back in after an expiry carries on where they were.
    // Anyone else starts at their own home page, not on the last person's page.
    if (!shouldResume(expiredFor.current, result.user?.id)) window.history.replaceState(null, '', '/')
    expiredFor.current = null
    setNotice('')
    saveSession(result)
    setSession(result)
  }

  function handleLogout() {
    expiredFor.current = null
    setNotice('')
    clearSession()
    setSession(null)
  }

  if (!session) return <Login onLogin={handleLogin} notice={notice} />

  const role = session.user?.role
  const isManager = role === 'ADMIN' || role === 'AUDIT_MANAGER'

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
            <Route path="/my-issues" element={guarded('my-issues', <Issues />)} />
            <Route path="/my-dashboard" element={guarded('my-dashboard', <AuditorDashboard />)} />
            <Route path="/audits" element={guarded('audits', <Audit />)} />
            <Route path="/audits/:id" element={guarded('audits', <AuditRoute />)} />
            <Route path="/audits/:id/review" element={guarded('audits', <ClassicAuditReview />)} />
            <Route path="/audits/:id/approve" element={guarded('audits', <AuditApproval />)} />
            <Route path="/scheduling" element={<SchedulingRedirect />} />
            <Route path="/questions" element={guarded('questions', <Questions />)} />
            <Route path="/stores"element={guarded('stores', <Stores />)} />
            <Route path="/approvals" element={guarded('approvals', <PendingApprovals />)} />
            <Route path="/email" element={guarded('email', <Email />)} />
            <Route path="/audit-log" element={guarded('audit-log', <AuditLog />)} />
            <Route
              path="/my-store"
              element={isManager ? <MyStoreRedirect /> : guarded('my-store', <StoreDashboard />)}
            />
            <Route path="/user-management" element={guarded('user-management', <UserManagement />)} />
            <Route path="*" element={<Navigate to={`/${firstAllowedPage(role)}`} replace />} />
          </Routes>
        </Layout>
      </ToastProvider>
    </BrowserRouter>
  )
}
