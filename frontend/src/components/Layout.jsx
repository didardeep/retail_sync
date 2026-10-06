import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { canAccess } from '@/lib/rolesMap';
import { NAV_ITEMS, titleFor } from '@/lib/nav';
import { Drawer } from '@/components/Modal';
import { NAV_ICONS } from '@/components/navIcons';

function SidebarContent({ user, onLogout, nav, onNavigate }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-sidebar-bg">
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
        {nav.map(({ path, label, icon }) => (
          <NavLink
            key={path}
            to={path}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'mb-0.5 flex items-center gap-2.5 whitespace-nowrap rounded-[7px] px-2.5 py-2.5 text-[12.5px] font-medium text-white no-underline transition-colors [&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:shrink-0',
                isActive ? 'bg-sidebar-active/30' : 'hover:bg-white/[.06]',
              )
            }
          >
            {NAV_ICONS[icon]}{label}
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
    </div>
  );
}

export default function Layout({ user, onLogout, children }) {
  const loc = useLocation();
  const title = titleFor(loc.pathname);
  const initial = (user?.name || user?.email || 'U')[0].toUpperCase();
  const nav = NAV_ITEMS.filter((n) => canAccess(user?.role, n.page));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <aside className="hidden w-[222px] shrink-0 md:flex">
        <SidebarContent user={user} onLogout={onLogout} nav={nav} />
      </aside>

      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} side="left" className="w-[240px] p-0">
        <SidebarContent user={user} onLogout={onLogout} nav={nav} onNavigate={() => setMobileNavOpen(false)} />
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-[22px]">
          <div className="flex items-center gap-2">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-[7px] text-lg md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              &#9776;
            </button>
            <div className="text-sm font-semibold text-foreground">{title}</div>
          </div>
          <div className="flex items-center gap-2.5">
            <button className="flex h-10 w-10 items-center justify-center rounded-[7px] border border-border bg-card text-[13px]" title="Notifications">&#x1F514;</button>
            <button className="hidden h-10 w-10 items-center justify-center rounded-[7px] border border-border bg-card text-[13px] sm:flex" title="Settings">&#x2699;&#xFE0F;</button>
            <div className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-[#00338D] to-[#0080DB] text-[11px] font-bold text-white">
              {initial}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-10 pt-[18px] md:px-[22px]">{children}</div>
      </div>
    </div>
  );
}
