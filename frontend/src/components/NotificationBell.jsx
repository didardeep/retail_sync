import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { cn } from '@/lib/utils';
import { issuesLink, sopAuditsLink, auditsLink } from '@/lib/links';

export default function NotificationBell({ role }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        if (role === 'AUDIT_MANAGER' || role === 'ADMIN') {
          const [sopAudits, issues] = await Promise.all([
            api.sopAudits('?status=Submitted').catch(() => []),
            api.issues().catch(() => []),
          ]);
          const pending = (sopAudits || []).filter(a => a.status === 'Submitted');
          const overdue = (issues || []).filter(i => i.is_overdue && i.status !== 'Resolved' && i.status !== 'Closed');
          const notifs = [];
          if (pending.length) notifs.push({ label: `${pending.length} audit${pending.length > 1 ? 's' : ''} awaiting approval`, link: sopAuditsLink({ status: 'Submitted' }) });
          if (overdue.length) notifs.push({ label: `${overdue.length} overdue issue${overdue.length > 1 ? 's' : ''}`, link: issuesLink({ status: 'Open', priority: 'Critical' }) });
          setItems(notifs);
        } else if (role === 'AUDITOR') {
          const sopAudits = await api.sopAudits('?status=Planned').catch(() => []);
          const planned = (sopAudits || []).filter(a => a.status === 'Planned');
          setItems(planned.length
            ? [{ label: `${planned.length} planned audit${planned.length > 1 ? 's' : ''} assigned`, link: sopAuditsLink({ status: 'Planned' }) }]
            : []);
        } else if (role === 'STORE_MANAGER') {
          const issues = await api.issues().catch(() => []);
          const open = (issues || []).filter(i => i.status === 'Open' || i.status === 'In Progress');
          setItems(open.length
            ? [{ label: `${open.length} open issue${open.length > 1 ? 's' : ''} for your store`, link: issuesLink({ status: 'Open' }) }]
            : []);
        }
      } catch {
        // silently ignore notification errors
      }
    }
    if (role) load();
  }, [role]);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function go(link) {
    setOpen(false);
    navigate(link);
  }

  return (
    <div ref={ref} className="relative">
      <button
        className="relative flex h-10 w-10 items-center justify-center rounded-[7px] border border-border bg-card text-[13px]"
        title="Notifications"
        onClick={() => setOpen(v => !v)}
      >
        &#x1F514;
        {items.length > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-[8px] w-[8px] items-center justify-center rounded-full bg-red-500" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[240px] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {items.length ? items.map((item, i) => (
            <button
              key={i}
              className="block w-full px-4 py-2.5 text-left text-[12.5px] text-foreground hover:bg-accent"
              onClick={() => go(item.link)}
            >
              {item.label}
            </button>
          )) : (
            <div className="px-4 py-3 text-[12.5px] text-muted-foreground">No new notifications</div>
          )}
        </div>
      )}
    </div>
  );
}
