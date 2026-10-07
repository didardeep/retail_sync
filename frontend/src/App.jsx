import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { clearSession, loadSession, saveSession } from './api/client'
import Layout from './components/Layout'
import RoleProtectedRoute from './components/RoleProtectedRoute'
import ToastProvider from './components/Toast'
import { listUnsynced, startSync, stopSync } from './lib/offline'
import { firstAllowedPage } from './lib/rolesMap'
import Login from './pages/Login'

import Dashboard from './pages/Dashboard'
import AuditorDashboard from './pages/AuditorDashboard'
import StoreAuditScores from './pages/StoreAuditScores'
import Issues from './pages/Issues'
import AuditStatus from './pages/AuditStatus'
import Scheduling from './pages/Scheduling'
import Questions from './pages/Questions'
import Stores from './pages/Stores'
import Email from './pages/Email'
import AuditLog from './pages/AuditLog'
import StoreDashboard from './pages/StoreDashboard'
import StoreChecklist from './pages/StoreChecklist'
import StoreCompliance from './pages/StoreCompliance'
import UserManagement from './pages/UserManagement'
import AuditRoute from './components/classic/AuditRoute'
import ClassicAuditReview from './pages/ClassicAuditReview'
import SopAudits from './pages/SopAudits'
import SopAuditWizard from './pages/SopAuditWizard'
import SopAuditReview from './pages/SopAuditReview'
import SopToolEditor from './pages/SopToolEditor'

// Old My Store bookmarks and links (/my-store?store=<id>) open the Dashboard
// store view for admin and Audit Manager; the ?store key is kept.
function MyStoreRedirect() {
  const { search } = useLocation()
  const store = new URLSearchParams(search).get('store')
  return <Navigate to={store ? `/dashboard?store=${encodeURIComponent(store)}` : '/dashboard'} replace />
}

export default function App() {
  const [session, setSession] = useState(loadSession())

  function handleLogin(result) {
    saveSession(result)
    setSession(result)
  }

  // Auditors sync offline audits in the background while signed in.
  const isAuditor = session?.user?.role === 'AUDITOR'
  useEffect(() => {
    if (!isAuditor) return undefined
    startSync()
    return stopSync
  }, [isAuditor])

  async function handleLogout() {
    if (isAuditor) {
      const pending = await listUnsynced().catch(() => [])
      const msg = `${pending.length} audit(s) have changes that have not synced yet. ` +
        'They stay safely on this device and sync when you sign in again. Sign out now?'
      if (pending.length && !window.confirm(msg)) return
    }
    clearSession()
    setSession(null)
  }

  if (!session) return <Login onLogin={handleLogin} />

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
            <Route path="/my-dashboard" element={guarded('my-dashboard', <AuditorDashboard />)} />
            <Route path="/audits" element={guarded('audits', <AuditStatus />)} />
            <Route path="/audits/:id" element={guarded('sop-audits', <AuditRoute />)} />
            <Route path="/audits/:id/review" element={guarded('sop-audits', <ClassicAuditReview />)} />
            <Route path="/scheduling" element={guarded('scheduling', <Scheduling />)} />
            <Route path="/questions" element={guarded('questions', <Questions />)} />
            <Route path="/questions/sop-tools/:code" element={guarded('sop-tools', <SopToolEditor />)} />
            <Route path="/stores"element={guarded('stores', <Stores />)} />
            <Route path="/email" element={guarded('email', <Email />)} />
            <Route path="/sop-audits" element={guarded('sop-audits', <SopAudits />)} />
            <Route path="/sop-audits/:id" element={guarded('sop-audits', <SopAuditWizard />)} />
            <Route path="/sop-audits/:id/review" element={guarded('sop-audits', <SopAuditReview />)} />
            <Route path="/audit-log" element={guarded('audit-log', <AuditLog />)} />
            <Route
              path="/my-store"
              element={isManager ? <MyStoreRedirect /> : guarded('my-store', <StoreDashboard />)}
            />
            <Route path="/checklist" element={guarded('checklist', <StoreChecklist />)} />
            <Route path="/compliance" element={guarded('compliance', <StoreCompliance />)} />
            <Route path="/user-management" element={guarded('user-management', <UserManagement />)} />
            <Route path="*" element={<Navigate to={`/${firstAllowedPage(role)}`} replace />} />
          </Routes>
        </Layout>
      </ToastProvider>
    </BrowserRouter>
  )
}
