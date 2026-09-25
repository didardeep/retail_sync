import { Navigate } from 'react-router-dom';

import { canAccess, firstAllowedPage } from '@/lib/rolesMap';

// Wraps a route element; redirects to the user's first allowed page if their
// role can't access this one. Backend still enforces this per-request via
// require_roles(...) in backend/app/auth.py -- this only stops the frontend
// from rendering a page the API is about to 401/403 on.
export default function RoleProtectedRoute({ role, page, children }) {
  if (!canAccess(role, page)) {
    return <Navigate to={`/${firstAllowedPage(role)}`} replace />;
  }
  return children;
}
