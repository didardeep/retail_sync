import { NavLink, useLocation } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { canAccess } from '@/lib/rolesMap';

const TITLES = {
  '/dashboard': 'Dashboard & Analytics',
  '/scores': 'Store Audit Scores',
  '/issues': 'Action Taken Tracking',
  '/audits': 'Audit Status',
  '/scheduling': 'Audit Scheduling',
  '/questions': 'Audit Questions',
  '/stores': 'Store Management',
  '/email': 'Email Communications',
  '/audit-log': 'Audit Log',
};

const NAV = [
  ['/dashboard', 'dashboard', 'Dashboard & Analytics', <svg key="d" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="6" width="4" height="15"/><rect x="17" y="2" width="4" height="19"/></svg>],
  ['/scores', 'scores', 'Store Audit Scores', <svg key="sc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,17 9,11 13,15 21,5"/></svg>],
  ['/issues', 'issues', 'Action Taken Tracking', <svg key="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L22 20H2Z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="16.5" r=".5" fill="currentColor"/></svg>],
  ['/audits', 'audits', 'Audit Status', <svg key="as" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><polyline points="8,12 11,15 16,9"/></svg>],
  ['/scheduling', 'scheduling', 'Audit Scheduling', <svg key="sh" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>],
  ['/questions', 'questions', 'Audit Questions', <svg key="q" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="3" width="16" height="18" rx="1"/><polyline points="8,9 10,11 14,7"/><line x1="8" y1="15" x2="16" y2="15"/></svg>],
  ['/stores', 'stores', 'Store Management', <svg key="st" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="1"/><path d="M16 21V7a4 4 0 00-8 0v14"/></svg>],
  ['/email', 'email', 'Email Communications', <svg key="e" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="1"/><polyline points="3,7 12,13 21,7"/></svg>],
  ['/audit-log', 'audit-log', 'Audit Log', <svg key="al" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12h6M9 16h6M9 8h6"/><rect x="4" y="3" width="16" height="18" rx="1"/></svg>],
];

export default function Layout({ user, onLogout, children }) {
  const loc = useLocation();
  const title = TITLES[loc.pathname] || 'Store Audit and Analysis';
  const initial = (user?.name || user?.email || 'U')[0].toUpperCase();
  const nav = NAV.filter(([, page]) => canAccess(user?.role, page));

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-[222px] shrink-0 flex-col overflow-y-auto bg-sidebar-bg">
        <div className="flex items-center gap-2.5 border-b border-white/[.07] px-3.5 pb-3.5 pt-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-bold text-white">
            SA
          </div>
          <div className="text-sm font-bold leading-tight text-white">
            Store Audit
            <span className="block text-[11px] font-normal text-sidebar-fg">and Analysis</span>
          </div>
        </div>
        <div className="mb-1 flex items-center gap-2 border-b border-white/[.07] px-3.5 py-2.5">
          <div className="h-[7px] w-[7px] rounded-full bg-amber-400" />
          <div className="text-[11px] text-sidebar-fg">
            <b className="block text-xs text-white">Hi, Welcome</b>
            {user?.name || user?.email || 'User'}
          </div>
        </div>
        <nav className="flex-1 px-2 py-1">
          {nav.map(([to, , label, icon]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'mb-0.5 flex items-center gap-2.5 whitespace-nowrap rounded-[7px] px-2.5 py-2 text-[12.5px] font-medium text-white no-underline transition-colors [&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:shrink-0',
                  isActive ? 'bg-sidebar-active/30' : 'hover:bg-white/[.06]',
                )
              }
            >
              {icon}{label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto p-3.5 pt-2.5">
          <Button
            onClick={onLogout}
            variant="outline"
            className="w-full border-white/35 bg-transparent text-xs text-white hover:bg-white/10 hover:text-white"
          >
            Sign out
          </Button>
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-border bg-card px-[22px]">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="flex items-center gap-2.5">
            <button className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border border-border bg-card text-[13px]" title="Notifications">&#x1F514;</button>
            <button className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border border-border bg-card text-[13px]" title="Settings">&#x2699;&#xFE0F;</button>
            <div className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-[#00338D] to-[#0080DB] text-[11px] font-bold text-white">
              {initial}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-[22px] pb-10 pt-[18px]">{children}</div>
      </div>
    </div>
  );
}
