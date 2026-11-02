import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { cn } from '@/lib/utils';
import { issuesLink, auditsLink } from '@/lib/links';
import { needsReview } from '@/lib/statuses';

export default function NotificationBell({ role }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        if (role === 'AUDIT_MANAGER' || role === 'ADMIN') {
          const [audits, issues] = await Promise.all([
            api.audits().catch(() => []),
            api.issues().catch(() => []),
          ]);
          const pending = (audits || []).filter(a => a.status === 'Completed');
          const overdue = (issues || []).filter(i => i.is_overdue && i.status !== 'Resolved' && i.status !== 'Closed');
          const notifs = [];
          if (pending.length) notifs.push({ label: `${pending.length} audit${pending.length > 1 ? 's' : ''} awaiting approval`, link: auditsLink({ stage: 'completed' }) });
          if (overdue.length) notifs.push({ label: `${overdue.length} overdue issue${overdue.length > 1 ? 's' : ''}`, link: issuesLink({ status: 'Open', priority: 'Critical' }) });
          setItems(notifs);
        } else if (role === 'AUDITOR') {
          const [audits, issues] = await Promise.all([
            api.audits().catch(() => []),
            api.issues().catch(() => []),
          ]);
          const planned = (audits || []).filter(a => a.status === 'Planned');
          const toReview = (issues || []).filter(needsReview);
          setItems([
            ...(planned.length ? [{ label: `${planned.length} planned audit${planned.length > 1 ? 's' : ''} assigned`, link: auditsLink({ stage: 'scheduled' }) }] : []),
            ...(toReview.length ? [{ label: `${toReview.length} issue${toReview.length > 1 ? 's' : ''} to review`, link: issuesLink({ status: 'Resolved' }) }] : []),
          ]);
        } else if (role === 'AUDITEE') {
          const issues = await api.issues().catch(() => []);
          const open = (issues || []).filter(i => i.status === 'Open' || i.status === 'In Progress');
          setItems(open.length
            ? [{ label: `${open.length} open issue${open.length > 1 ? 's' : ''} assigned to you`, link: '/my-issues' }]
            : []);
        } else if (role === 'CLUSTER_HEAD' || role === 'HO_OPERATIONS') {
          setItems([]);
        } else if (role === 'STORE_MANAGER') {
          const issues = await api.issues().catch(() => []);
          const open = (issues || []).filter(i => i.status === 'Open' || i.status === 'In Progress');
          setItems(open.length
            ? [{ label: `${open.length} open issue${open.length > 1 ? 's' : ''} for your store`, link: issuesLink({ status: 'Open' }) }]
            : []);
        }
        // Reminders and escalations sent to this person; these clear once opened.
        const alerts = await api.notifications().catch(() => []);
        setItems((prev) => [...(alerts || []).map((n) => ({ id: n.id, label: n.title, link: n.link })), ...prev]);
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

  function go(item) {
    setOpen(false);
    if (item.id) {
      api.readNotification(item.id).catch(() => {});
      setItems((prev) => prev.filter((x) => x !== item));
    }
    if (item.link) navigate(item.link);
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
              onClick={() => go(item)}
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
