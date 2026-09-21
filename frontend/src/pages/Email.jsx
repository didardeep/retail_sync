import { useState } from 'react';
import { useToast } from '../components/Toast';

const EMAIL_LABEL_COLORS = {Audit:'#00338D',Billing:'#0e9f6e',Customer:'#f59e0b',Legal:'#8b5cf6',Operations:'#06b6d4'};
const EMAIL_LABEL_BG = {Audit:'#e8eefa',Billing:'#def7ec',Customer:'#fdf6b2',Legal:'#ede9fe',Operations:'#e3f3ff'};
const EMAIL_TEMPLATES = {
  audit: {subj:'Audit Summary Report',body:'Dear Team,\n\nPlease find attached the audit summary report for the recent store visit.\n\nKey findings and recommendations are outlined in the attached document.\n\nBest regards,\nQA Team'},
  issue: {subj:'Follow-up on Reported Issue',body:'Dear Store Manager,\n\nThis is a follow-up regarding the issue reported during the last audit.\n\nPlease provide an update on the corrective actions taken.\n\nRegards,\nAudit Team'},
  reminder: {subj:'Compliance Reminder',body:'Dear Team,\n\nThis is a reminder to ensure all compliance documentation is updated before the next scheduled audit.\n\nPlease verify the following:\n- All licenses are current\n- Safety certificates are displayed\n- Staff training records are up to date\n\nBest regards,\nCompliance Team'},
};
const INITIAL_EMAILS = [
  {id:'E001',from:'qa@brand.com',date:'11 Jun, 14:25',subj:'Audit report for Store Delhi #01',prev:'Please find attached the October audit summary...',labels:['Audit','Operations'],star:true,att:true,folder:'Inbox'},
  {id:'E002',from:'warehouse@brand.com',date:'11 Jun, 13:29',subj:'Stock shortage alert \u2013 coffee beans',prev:'Stock for coffee beans below reorder level at Delhi warehouse.',labels:['Operations'],star:false,att:false,folder:'Inbox'},
  {id:'E003',from:'ops.head@brand.com',date:'11 Jun, 11:25',subj:'Weekly cleaning compliance check',prev:'Please confirm if the cleaning checklist was completed for all zones.',labels:['Operations'],star:false,att:false,folder:'Inbox'},
  {id:'E004',from:'customer.relations@brand.com',date:'11 Jun, 08:25',subj:'Positive feedback \u2013 Delhi Store',prev:'Customer appreciated cleanliness and quick service.',labels:['Customer'],star:true,att:false,folder:'Inbox'},
  {id:'E005',from:'jane.doe@gmail.com',date:'10 Jun, 16:25',subj:'Customer complaint \u2013 incorrect billing',prev:'I was charged twice for my order yesterday...',labels:['Customer','Billing'],star:false,att:false,folder:'Inbox'},
  {id:'E006',from:'qa@brand.com',date:'10 Jun, 16:25',subj:'Audit findings \u2013 Store Mumbai #07',prev:'Attached summary of minor compliance issues found during audit.',labels:['Audit'],star:true,att:true,folder:'Inbox'},
  {id:'E007',from:'legal@brand.com',date:'09 Jun, 16:25',subj:'FW: Legal notice for signage placement',prev:'Sharing notice regarding outdoor signage restrictions...',labels:['Legal'],star:false,att:true,folder:'Inbox'},
  {id:'E008',from:'it.support@brand.com',date:'05 Jun, 16:25',subj:'System update scheduled',prev:'Scheduled downtime for POS maintenance.',labels:['Operations'],star:false,att:false,folder:'Inbox'},
];

const FOLDERS = [
  { key: 'Inbox',   icon: '\ud83d\udce5' },
  { key: 'Starred', icon: '\u2b50' },
  { key: 'Sent',    icon: '\u27a4' },
  { key: 'Drafts',  icon: '\ud83d\udcc4' },
  { key: 'Archive', icon: '\ud83d\udce6' },
  { key: 'Trash',   icon: '\ud83d\uddd1' },
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
      <div className="page-hdr">
        <h2>Email</h2>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={openCompose}>+ Compose</button>
        </div>
      </div>

      {/* layout */}
      <div className="em-layout">
        {/* sidebar */}
        <div className="em-sb">
          {FOLDERS.map(f => (
            <div
              key={f.key}
              className={'em-fld' + (folder === f.key ? ' active' : '')}
              onClick={() => { setFolder(f.key); setSelected([]); }}
            >
              <span className="em-fi">{f.icon} {f.key}</span>
              <span className="em-fc">{folderCount(f.key)}</span>
            </div>
          ))}

          <div style={{ margin: '16px 0 6px', padding: '0 9px', fontSize: '10px', fontWeight: 700, color: 'var(--text3)', letterSpacing: '.06em' }}>
            LABELS
          </div>

          {LABELS.map(lb => (
            <div
              key={lb}
              onClick={() => setLabelFilter(prev => prev === lb ? '' : lb)}
              style={{
                display: 'inline-block',
                margin: '2px 3px',
                padding: '3px 9px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
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
        <div className="em-main">
          {/* toolbar */}
          <div className="em-tb">
            <div className="srch" style={{ minWidth: 140, flex: 1 }}>
              <span className="srch-ic">&#128269;</span>
              <input
                placeholder="Search emails..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="sel" value={labelDropdown} onChange={e => setLabelDropdown(e.target.value)}>
              <option value="">All labels</option>
              {LABELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <input type="date" className="sel" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
            <input type="date" className="sel" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
            <select className="sel" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="default">Default</option>
              <option value="newest">Newest</option>
            </select>
            <button className="btn btn-outline btn-sm" onClick={() => { setSearch(''); setLabelDropdown(''); setDateFrom(''); setDateTo(''); setSortBy('default'); }}>
              &#x21bb; Refresh
            </button>
          </div>

          {/* column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '36px 185px 1fr', padding: '7px 14px', borderBottom: '1px solid var(--border)', background: '#fafafa', fontSize: '11px', fontWeight: 600, color: 'var(--text3)' }}>
            <span></span>
            <span>From / To</span>
            <span>Subject</span>
          </div>

          {/* email list */}
          <div className="em-list">
            {filtered.length === 0 && (
              <div style={{ padding: '30px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
                No emails found.
              </div>
            )}
            {filtered.map(e => (
              <div key={e.id} className="em-row">
                <input
                  type="checkbox"
                  checked={selected.includes(e.id)}
                  onChange={() => toggleSelect(e.id)}
                  style={{ marginTop: 3, flexShrink: 0 }}
                />
                <span
                  className={'em-star' + (e.star ? ' starred' : '')}
                  onClick={() => toggleStar(e.id)}
                >
                  &#9733;
                </span>
                <div style={{ minWidth: 175, flexShrink: 0 }}>
                  <div className="em-from">{e.from}</div>
                  <div className="em-date">{e.date}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="em-subj">{e.subj}</div>
                  <div className="em-prev">{e.prev}</div>
                  <div className="em-tags">
                    {e.labels && e.labels.map(lb => (
                      <span
                        key={lb}
                        style={{
                          background: EMAIL_LABEL_BG[lb] || '#f3f4f6',
                          color: EMAIL_LABEL_COLORS[lb] || '#374151',
                          padding: '2px 7px',
                          borderRadius: '10px',
                          fontSize: '10px',
                          fontWeight: 600,
                        }}
                      >
                        {lb}
                      </span>
                    ))}
                    {e.att && <span style={{ fontSize: '12px', marginLeft: 2 }}>{'\ud83d\udcce'}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* footer */}
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text3)' }}>
            {filtered.length} thread(s)
          </div>
        </div>
      </div>

      {/* compose modal */}
      <div className={'modal-ov' + (showCompose ? ' open' : '')}>
        <div className="modal" style={{ width: 900, maxWidth: '95vw' }}>
          {/* modal header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setShowCompose(false)}
                style={{ padding: '4px 8px', fontSize: '14px', lineHeight: 1 }}
              >
                &#10005;
              </button>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Compose</span>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              <button className="btn btn-outline btn-sm" onClick={scheduleEmail}>Schedule</button>
              <button className="btn btn-primary btn-sm" onClick={sendEmail}>Send</button>
              <button className="btn btn-outline btn-sm" onClick={saveDraft}>Save draft</button>
            </div>
          </div>

          {/* form fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label className="fl">From</label>
              <input className="fi" readOnly value="QA Team <qa@brand.com>" />
            </div>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label className="fl">Labels</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '6px 0' }}>
                {LABELS.map(lb => (
                  <span
                    key={lb}
                    onClick={() => setCompLabels(prev => prev.includes(lb) ? prev.filter(x => x !== lb) : [...prev, lb])}
                    style={{
                      display: 'inline-block',
                      padding: '3px 9px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
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

          <div className="fg">
            <label className="fl">To</label>
            <input className="fi" placeholder="recipient@example.com" value={compTo} onChange={e => setCompTo(e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="fg">
              <label className="fl">Cc</label>
              <input className="fi" placeholder="cc@example.com" value={compCc} onChange={e => setCompCc(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Bcc</label>
              <input className="fi" placeholder="bcc@example.com" value={compBcc} onChange={e => setCompBcc(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="fg">
              <label className="fl">Subject</label>
              <input className="fi" placeholder="Email subject" value={compSubj} onChange={e => setCompSubj(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Template</label>
              <select className="fi" value={compTemplate} onChange={e => applyTemplate(e.target.value)} style={{ cursor: 'pointer' }}>
                {TEMPLATE_OPTIONS.map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="fg">
            <label className="fl">Message</label>
            <textarea
              className="fta"
              style={{ minHeight: 170 }}
              placeholder="Write your message..."
              value={compBody}
              onChange={e => setCompBody(e.target.value)}
            />
          </div>

          <div className="fg" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="sig-chk" checked={compSig} onChange={e => setCompSig(e.target.checked)} />
            <label htmlFor="sig-chk" style={{ fontSize: '12px', color: 'var(--text2)', cursor: 'pointer' }}>Add signature</label>
          </div>

          {/* attachments */}
          <div className="fg">
            <label className="fl">Attachments</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="file"
                id="em-file-input"
                multiple
                onChange={handleFiles}
                style={{ display: 'none' }}
              />
              <button
                className="btn btn-outline btn-sm"
                onClick={() => document.getElementById('em-file-input').click()}
              >
                {'\ud83d\udcce'} Add files
              </button>
            </div>
            {compFiles.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {compFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: 'var(--text2)' }}>
                    <span>{'\ud83d\udcce'} {f.name}</span>
                    <button
                      onClick={() => removeFile(i)}
                      style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '13px', padding: 0 }}
                    >
                      &#10005;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
