import { NavLink, useLocation } from 'react-router-dom';

const TITLES = {
  '/dashboard': 'Dashboard & Analytics',
  '/scores': 'Store Audit Scores',
  '/issues': 'Action Taken Tracking',
  '/audits': 'Audit Status',
  '/scheduling': 'Audit Scheduling',
  '/questions': 'Audit Questions',
  '/stores': 'Store Management',
  '/email': 'Email Communications',
};

const NAV = [
  ['/dashboard', 'Dashboard & Analytics', <svg key="d" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="6" width="4" height="15"/><rect x="17" y="2" width="4" height="19"/></svg>],
  ['/scores', 'Store Audit Scores', <svg key="sc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,17 9,11 13,15 21,5"/></svg>],
  ['/issues', 'Action Taken Tracking', <svg key="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L22 20H2Z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="16.5" r=".5" fill="currentColor"/></svg>],
  ['/audits', 'Audit Status', <svg key="as" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><polyline points="8,12 11,15 16,9"/></svg>],
  ['/scheduling', 'Audit Scheduling', <svg key="sh" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>],
  ['/questions', 'Audit Questions', <svg key="q" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="3" width="16" height="18" rx="1"/><polyline points="8,9 10,11 14,7"/><line x1="8" y1="15" x2="16" y2="15"/></svg>],
  ['/stores', 'Store Management', <svg key="st" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="1"/><path d="M16 21V7a4 4 0 00-8 0v14"/></svg>],
  ['/email', 'Email Communications', <svg key="e" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="1"/><polyline points="3,7 12,13 21,7"/></svg>],
];

export default function Layout({ user, onLogout, children }) {
  const loc = useLocation();
  const title = TITLES[loc.pathname] || 'Store Audit and Analysis';
  const initial = (user?.name || user?.email || 'U')[0].toUpperCase();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">SA</div>
          <div className="brand-text">Store Audit<span>and Analysis</span></div>
        </div>
        <div className="sidebar-user">
          <div className="user-dot" />
          <div className="user-lbl"><b>Hi, Welcome</b>{user?.name || user?.email || 'User'}</div>
        </div>
        <nav>
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              {icon}{label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '10px 14px', marginTop: 'auto' }}>
          <button onClick={onLogout} style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,.35)', color: '#fff', borderRadius: 6, padding: 8, fontSize: 12, cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="topbar-right">
            <button className="icon-btn" title="Notifications">&#x1F514;</button>
            <button className="icon-btn" title="Settings">&#x2699;&#xFE0F;</button>
            <div className="avatar-btn">{initial}</div>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
