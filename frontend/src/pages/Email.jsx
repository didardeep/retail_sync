import { useState } from 'react';
import { useToast } from '../components/Toast';
import { cn, fieldClass, labelClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '../components/Modal';

const EMAIL_LABEL_COLORS = {Audit:'#00338D',Billing:'#0e9f6e',Customer:'#f59e0b',Legal:'#8b5cf6',Operations:'#06b6d4'};
const EMAIL_LABEL_BG = {Audit:'#e8eefa',Billing:'#def7ec',Customer:'#fdf6b2',Legal:'#ede9fe',Operations:'#e3f3ff'};
const EMAIL_TEMPLATES = {
  audit: {subj:'Audit Summary Report',body:'Dear Team,\n\nPlease find attached the audit summary report for the recent store visit.\n\nKey findings and recommendations are outlined in the attached document.\n\nBest regards,\nQA Team'},
  issue: {subj:'Follow-up on Reported Issue',body:'Dear Store Manager,\n\nThis is a follow-up regarding the issue reported during the last audit.\n\nPlease provide an update on the corrective actions taken.\n\nRegards,\nAudit Team'},
  reminder: {subj:'Compliance Reminder',body:'Dear Team,\n\nThis is a reminder to ensure all compliance documentation is updated before the next scheduled audit.\n\nPlease verify the following:\n- All licenses are current\n- Safety certificates are displayed\n- Staff training records are up to date\n\nBest regards,\nCompliance Team'},
};
const INITIAL_EMAILS = [
  {id:'E001',from:'qa@brand.com',date:'11 Jun, 14:25',subj:'Audit report for Store Delhi #01',prev:'Please find attached the October audit summary...',labels:['Audit','Operations'],star:true,att:true,folder:'Inbox'},
  {id:'E002',from:'warehouse@brand.com',date:'11 Jun, 13:29',subj:'Stock shortage alert – coffee beans',prev:'Stock for coffee beans below reorder level at Delhi warehouse.',labels:['Operations'],star:false,att:false,folder:'Inbox'},
  {id:'E003',from:'ops.head@brand.com',date:'11 Jun, 11:25',subj:'Weekly cleaning compliance check',prev:'Please confirm if the cleaning checklist was completed for all zones.',labels:['Operations'],star:false,att:false,folder:'Inbox'},
  {id:'E004',from:'customer.relations@brand.com',date:'11 Jun, 08:25',subj:'Positive feedback – Delhi Store',prev:'Customer appreciated cleanliness and quick service.',labels:['Customer'],star:true,att:false,folder:'Inbox'},
  {id:'E005',from:'jane.doe@gmail.com',date:'10 Jun, 16:25',subj:'Customer complaint – incorrect billing',prev:'I was charged twice for my order yesterday...',labels:['Customer','Billing'],star:false,att:false,folder:'Inbox'},
  {id:'E006',from:'qa@brand.com',date:'10 Jun, 16:25',subj:'Audit findings – Store Mumbai #07',prev:'Attached summary of minor compliance issues found during audit.',labels:['Audit'],star:true,att:true,folder:'Inbox'},
  {id:'E007',from:'legal@brand.com',date:'09 Jun, 16:25',subj:'FW: Legal notice for signage placement',prev:'Sharing notice regarding outdoor signage restrictions...',labels:['Legal'],star:false,att:true,folder:'Inbox'},
  {id:'E008',from:'it.support@brand.com',date:'05 Jun, 16:25',subj:'System update scheduled',prev:'Scheduled downtime for POS maintenance.',labels:['Operations'],star:false,att:false,folder:'Inbox'},
];

const FOLDERS = [
  { key: 'Inbox',   icon: '📥' },
  { key: 'Starred', icon: '⭐' },
  { key: 'Sent',    icon: '➤' },
  { key: 'Drafts',  icon: '📄' },
  { key: 'Archive', icon: '📦' },
  { key: 'Trash',   icon: '🗑' },
];

const LABELS = ['Audit', 'Billing', 'Customer', 'Legal', 'Operations'];

const TEMPLATE_OPTIONS = [
  { key: '', label: 'Select template...' },
  { key: 'audit', label: 'Audit Summary' },
  { key: 'issue', label: 'Issue Follow-up' },
  { key: 'reminder', label: 'Compliance Reminder' },
];

export default function Email() {
  const toast = useToast();

  const [emails, setEmails] = useState(() => INITIAL_EMAILS.map(e => ({ ...e })));
  const [folder, setFolder] = useState('Inbox');
  const [labelFilter, setLabelFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [labelDropdown, setLabelDropdown] = useState('');
  const [selected, setSelected] = useState([]);

  // compose modal
  const [showCompose, setShowCompose] = useState(false);
  const [compTo, setCompTo] = useState('');
  const [compCc, setCompCc] = useState('');
  const [compBcc, setCompBcc] = useState('');
  const [compSubj, setCompSubj] = useState('');
  const [compBody, setCompBody] = useState('');
  const [compTemplate, setCompTemplate] = useState('');
  const [compLabels, setCompLabels] = useState([]);
  const [compSig, setCompSig] = useState(true);
  const [compFiles, setCompFiles] = useState([]);

  /* ---- helpers ---- */

  function folderCount(f) {
    if (f === 'Starred') return emails.filter(e => e.star).length;
    return emails.filter(e => e.folder === f).length;
  }

  function filteredEmails() {
    let list = emails;

    // folder
    if (folder === 'Starred') {
      list = list.filter(e => e.star === true);
    } else {
      list = list.filter(e => e.folder === folder);
    }

    // label (sidebar)
    if (labelFilter) {
      list = list.filter(e => e.labels && e.labels.includes(labelFilter));
    }

    // label (toolbar dropdown)
    if (labelDropdown) {
      list = list.filter(e => e.labels && e.labels.includes(labelDropdown));
    }

    // search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        (e.subj && e.subj.toLowerCase().includes(q)) ||
        (e.from && e.from.toLowerCase().includes(q))
      );
    }

    // sort
    if (sortBy === 'newest') {
      list = [...list].reverse();
    }

    return list;
  }

  function toggleStar(id) {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, star: !e.star } : e));
  }

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  /* ---- compose ---- */

  function openCompose() {
    setCompTo('');
    setCompCc('');
    setCompBcc('');
    setCompSubj('');
    setCompBody('');
    setCompTemplate('');
    setCompLabels([]);
    setCompSig(true);
    setCompFiles([]);
    setShowCompose(true);
  }

  function applyTemplate(key) {
    setCompTemplate(key);
    if (key && EMAIL_TEMPLATES[key]) {
      setCompSubj(EMAIL_TEMPLATES[key].subj);
      setCompBody(EMAIL_TEMPLATES[key].body);
    }
  }

  function handleFiles(e) {
    const files = Array.from(e.target.files);
    setCompFiles(prev => [...prev, ...files]);
    e.target.value = '';
  }

  function removeFile(idx) {
    setCompFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function sendEmail() {
    const newEmail = {
      id: 'E' + String(Date.now()),
      from: 'qa@brand.com',
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ', ' +
            new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      subj: compSubj || '(no subject)',
      prev: compBody.slice(0, 80) || '',
      labels: compLabels.length ? compLabels : [],
      star: false,
      att: compFiles.length > 0,
      folder: 'Sent',
    };
    setEmails(prev => [newEmail, ...prev]);
    setShowCompose(false);
    toast('Email sent');
  }

  function saveDraft() {
    const newEmail = {
      id: 'E' + String(Date.now()),
      from: 'qa@brand.com',
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ', ' +
            new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      subj: compSubj || '(no subject)',
      prev: compBody.slice(0, 80) || '',
      labels: compLabels.length ? compLabels : [],
      star: false,
      att: compFiles.length > 0,
      folder: 'Drafts',
    };
    setEmails(prev => [newEmail, ...prev]);
    setShowCompose(false);
    toast('Draft saved');
  }

  function scheduleEmail() {
    setShowCompose(false);
    toast('Email scheduled');
  }

  const filtered = filteredEmails();

  /* ---- render ---- */
  return (
    <>
      {/* header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="text-xl font-bold text-foreground">Email</h2>
        <Button onClick={openCompose}>+ Compose</Button>
      </div>

      {/* layout */}
      <div className="flex overflow-hidden rounded-[10px] border border-border bg-card" style={{ height: 'calc(100vh - 148px)' }}>
        {/* sidebar */}
        <div className="w-[190px] shrink-0 border-r border-border p-2.5">
          {FOLDERS.map(f => (
            <div
              key={f.key}
              className={cn('mb-0.5 flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12.5px] text-foreground/80', folder === f.key ? 'bg-accent text-primary' : 'hover:bg-accent hover:text-primary')}
              onClick={() => { setFolder(f.key); setSelected([]); }}
            >
              <span className="flex items-center gap-1.5">{f.icon} {f.key}</span>
              <span className="rounded-full bg-primary px-1.5 text-[9.5px] font-bold text-primary-foreground">{folderCount(f.key)}</span>
            </div>
          ))}

          <div className="mb-1.5 mt-4 px-2 text-[10px] font-bold tracking-wide text-muted-foreground">
            LABELS
          </div>

          {LABELS.map(lb => (
            <div
              key={lb}
              onClick={() => setLabelFilter(prev => prev === lb ? '' : lb)}
              className="m-0.5 inline-block cursor-pointer rounded-xl px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                background: EMAIL_LABEL_BG[lb],
                color: EMAIL_LABEL_COLORS[lb],
                border: labelFilter === lb ? `2px solid ${EMAIL_LABEL_COLORS[lb]}` : '2px solid transparent',
              }}
            >
              {lb}
            </div>
          ))}
        </div>

        {/* main */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* toolbar */}
          <div className="flex items-center gap-2 border-b border-border p-2.5">
            <div className="relative min-w-[140px] flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">&#128269;</span>
              <Input className="pl-8" placeholder="Search emails..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={labelDropdown} onChange={e => setLabelDropdown(e.target.value)}>
              <option value="">All labels</option>
              {LABELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <input type="date" className={cn(fieldClass, 'w-auto cursor-pointer')} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
            <input type="date" className={cn(fieldClass, 'w-auto cursor-pointer')} value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
            <select className={cn(fieldClass, 'w-auto cursor-pointer')} value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="default">Default</option>
              <option value="newest">Newest</option>
            </select>
            <Button size="sm" variant="outline" onClick={() => { setSearch(''); setLabelDropdown(''); setDateFrom(''); setDateTo(''); setSortBy('default'); }}>
              &#x21bb; Refresh
            </Button>
          </div>

          {/* column headers */}
          <div className="grid grid-cols-[36px_185px_1fr] border-b border-border bg-gray-50 px-3.5 py-1.5 text-[11px] font-semibold text-muted-foreground">
            <span></span>
            <span>From / To</span>
            <span>Subject</span>
          </div>

          {/* email list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="p-8 text-center text-[13px] text-muted-foreground">
                No emails found.
              </div>
            )}
            {filtered.map(e => (
              <div key={e.id} className="flex items-start gap-2.5 border-b border-border px-3.5 py-2.5 transition-colors last:border-0 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.includes(e.id)}
                  onChange={() => toggleSelect(e.id)}
                  className="mt-0.5 shrink-0"
                />
                <span
                  className={cn('shrink-0 cursor-pointer text-[13px]', e.star ? 'text-amber-500' : 'text-gray-200')}
                  onClick={() => toggleStar(e.id)}
                >
                  &#9733;
                </span>
                <div className="shrink-0" style={{ minWidth: 175 }}>
                  <div className="text-xs font-semibold text-foreground">{e.from}</div>
                  <div className="text-[11px] text-muted-foreground">{e.date}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 text-[12.5px] font-semibold text-foreground">{e.subj}</div>
                  <div className="mb-1 text-[11.5px] text-muted-foreground">{e.prev}</div>
                  <div className="flex flex-wrap gap-1">
                    {e.labels && e.labels.map(lb => (
                      <span
                        key={lb}
                        className="rounded-[10px] px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: EMAIL_LABEL_BG[lb] || '#f3f4f6', color: EMAIL_LABEL_COLORS[lb] || '#374151' }}
                      >
                        {lb}
                      </span>
                    ))}
                    {e.att && <span className="ml-0.5 text-xs">{'📎'}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* footer */}
          <div className="border-t border-border px-3.5 py-2 text-xs text-muted-foreground">
            {filtered.length} thread(s)
          </div>
        </div>
      </div>

      {/* compose modal */}
      <Modal open={showCompose} onClose={() => setShowCompose(false)} className="w-[900px] max-w-[95vw]">
        {/* modal header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" className="px-2 py-1 text-sm leading-none" onClick={() => setShowCompose(false)}>
              &#10005;
            </Button>
            <span className="text-[15px] font-bold text-foreground">Compose</span>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={scheduleEmail}>Schedule</Button>
            <Button size="sm" onClick={sendEmail}>Send</Button>
            <Button size="sm" variant="outline" onClick={saveDraft}>Save draft</Button>
          </div>
        </div>

        <div className="grid gap-3">
          {/* form fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>From</label>
              <Input readOnly value="QA Team <qa@brand.com>" />
            </div>
            <div>
              <label className={labelClass}>Labels</label>
              <div className="flex flex-wrap gap-1 py-1.5">
                {LABELS.map(lb => (
                  <span
                    key={lb}
                    onClick={() => setCompLabels(prev => prev.includes(lb) ? prev.filter(x => x !== lb) : [...prev, lb])}
                    className="inline-block cursor-pointer rounded-xl px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{
                      background: EMAIL_LABEL_BG[lb],
                      color: EMAIL_LABEL_COLORS[lb],
                      border: compLabels.includes(lb) ? `2px solid ${EMAIL_LABEL_COLORS[lb]}` : '2px solid transparent',
                    }}
                  >
                    {lb}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>To</label>
            <Input placeholder="recipient@example.com" value={compTo} onChange={e => setCompTo(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Cc</label>
              <Input placeholder="cc@example.com" value={compCc} onChange={e => setCompCc(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Bcc</label>
              <Input placeholder="bcc@example.com" value={compBcc} onChange={e => setCompBcc(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Subject</label>
              <Input placeholder="Email subject" value={compSubj} onChange={e => setCompSubj(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Template</label>
              <select className={cn(fieldClass, 'cursor-pointer')} value={compTemplate} onChange={e => applyTemplate(e.target.value)}>
                {TEMPLATE_OPTIONS.map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Message</label>
            <textarea
              className={cn(fieldClass, 'min-h-[170px] resize-y')}
              placeholder="Write your message..."
              value={compBody}
              onChange={e => setCompBody(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="sig-chk" checked={compSig} onChange={e => setCompSig(e.target.checked)} />
            <label htmlFor="sig-chk" className="cursor-pointer text-xs text-foreground/80">Add signature</label>
          </div>

          {/* attachments */}
          <div>
            <label className={labelClass}>Attachments</label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                id="em-file-input"
                multiple
                onChange={handleFiles}
                className="hidden"
              />
              <Button size="sm" variant="outline" onClick={() => document.getElementById('em-file-input').click()}>
                {'📎'} Add files
              </Button>
            </div>
            {compFiles.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {compFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-foreground/80">
                    <span>{'📎'} {f.name}</span>
                    <button
                      onClick={() => removeFile(i)}
                      className="border-none bg-transparent p-0 text-[13px] text-destructive"
                    >
                      &#10005;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
