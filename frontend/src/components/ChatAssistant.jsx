import { useState, useRef, useEffect } from 'react';
import { Bar, Line, Pie } from 'react-chartjs-2';
import '../utils/chartSetup.js';
import { api } from '../api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Palette for chart series
const PALETTE = ['#00338D', '#0080DB', '#0e9f6e', '#f59e0b', '#e02424', '#7c3aed'];

// Starter questions per role
const STARTERS = {
  AUDIT_MANAGER: [
    'Stores below score 70',
    'Overdue critical issues',
    'Audits awaiting approval',
    'Which process has most failures?',
    'Data freshness status',
  ],
  AUDITOR: [
    'My audits this week',
    'My ongoing audits',
    'Show critical checklist questions',
  ],
  STORE_MANAGER: [
    'My open issues',
    'Last audit score',
    'My expired inventory',
    'Cash reconciliation exceptions',
  ],
};

// Simple bold + line-break markdown renderer
function Md({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <span>
      {lines.map((line, li) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <span key={li}>
            {parts.map((p, pi) =>
              p.startsWith('**') && p.endsWith('**')
                ? <strong key={pi}>{p.slice(2, -2)}</strong>
                : p
            )}
            {li < lines.length - 1 && <br />}
          </span>
        );
      })}
    </span>
  );
}

// Chart block
function ChatChart({ spec }) {
  const labels = spec.data.map(d => d[spec.x_key] ?? '');
  const datasets = spec.series.map((s, i) => ({
    label: s.name,
    data: spec.data.map(d => d[s.key] ?? 0),
    backgroundColor: PALETTE[i % PALETTE.length] + (spec.type === 'line' ? '33' : 'CC'),
    borderColor: PALETTE[i % PALETTE.length],
    borderWidth: 2,
    fill: spec.type === 'line',
    tension: 0.3,
    pointRadius: 3,
  }));
  const opts = {
    responsive: true,
    plugins: { legend: { display: datasets.length > 1, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
    scales: spec.type !== 'pie' ? {
      x: { ticks: { font: { size: 10 } } },
      y: { ticks: { font: { size: 10 } }, title: { display: !!spec.y_label, text: spec.y_label, font: { size: 10 } } },
    } : undefined,
  };
  const data = { labels, datasets };
  return (
    <div className="mt-2 rounded-lg border border-border bg-card p-3">
      {spec.title && <div className="mb-2 text-[11px] font-semibold text-muted-foreground">{spec.title}</div>}
      <div style={{ maxHeight: 200 }}>
        {spec.type === 'bar' && <Bar data={data} options={opts} />}
        {spec.type === 'line' && <Line data={data} options={opts} />}
        {spec.type === 'pie' && <Pie data={data} options={opts} />}
      </div>
    </div>
  );
}

// Table block
function ChatTable({ spec }) {
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border">
      {spec.title && <div className="border-b border-border bg-muted/20 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">{spec.title}</div>}
      <Table>
        <TableHeader>
          <TableRow>
            {spec.columns.map((c, i) => <TableHead key={i} className="text-[11px]">{c}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {spec.rows.map((row, ri) => (
            <TableRow key={ri}>
              {row.map((cell, ci) => <TableCell key={ci} className="text-[11px] py-1.5">{String(cell ?? '')}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Cards block
function ChatCards({ spec }) {
  return (
    <div className="mt-2">
      {spec.title && <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground">{spec.title}</div>}
      <div className="grid grid-cols-2 gap-2">
        {spec.items.map((item, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-2.5">
            <div className="flex items-start justify-between gap-1">
              <div className="text-[11px] text-muted-foreground">{item.name}</div>
              {item.badge && <Badge className="shrink-0 text-[9px] px-1 py-0">{item.badge}</Badge>}
            </div>
            <div className="mt-0.5 text-[15px] font-bold text-foreground leading-none">{item.value}</div>
            {item.subtitle && <div className="mt-0.5 text-[10px] text-muted-foreground">{item.subtitle}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Details block (collapsible rows)
function ChatDetails({ spec }) {
  const [open, setOpen] = useState({});
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border">
      {spec.title && <div className="border-b border-border bg-muted/20 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">{spec.title}</div>}
      {spec.items.map((item, i) => (
        <div key={i} className="border-b border-border last:border-0">
          <button
            className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/30"
            onClick={() => setOpen(o => ({ ...o, [i]: !o[i] }))}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11.5px] font-medium text-foreground truncate">{item.summary}</span>
              {item.badge && <Badge className="shrink-0 text-[9px] px-1 py-0">{item.badge}</Badge>}
            </div>
            <span className="text-[10px] text-muted-foreground ml-2">{open[i] ? '▲' : '▼'}</span>
          </button>
          {open[i] && (
            <div className="border-t border-border bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground whitespace-pre-wrap">
              {item.detail}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Single message bubble
function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[88%] rounded-[12px] px-3 py-2 text-[12.5px] leading-relaxed',
          isUser
            ? 'rounded-tr-[3px] bg-primary text-primary-foreground'
            : 'rounded-tl-[3px] border border-border bg-card text-foreground'
        )}
      >
        {isUser ? msg.content : <Md text={msg.content} />}
      </div>
      {/* Structured blocks */}
      {!isUser && (
        <div className="max-w-[92%] w-full">
          {(msg.charts || []).map((c, i) => <ChatChart key={i} spec={c} />)}
          {(msg.tables || []).map((t, i) => <ChatTable key={i} spec={t} />)}
          {(msg.cards || []).map((c, i) => <ChatCards key={i} spec={c} />)}
          {(msg.details || []).map((d, i) => <ChatDetails key={i} spec={d} />)}
        </div>
      )}
      {/* Suggestion chips */}
      {!isUser && msg.suggestions?.length > 0 && (
        <div className="mt-1.5 flex max-w-[92%] flex-wrap gap-1.5">
          {msg.suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => msg._onSuggest?.(s)}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatAssistant({ user }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const role = user?.role || 'AUDIT_MANAGER';
  const starters = STARTERS[role] || STARTERS.AUDIT_MANAGER;

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        inputRef.current?.focus();
      }, 100);
    }
  }, [open, messages.length]);

  async function sendMessage(text) {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const res = await api.chat(history, convId);
      if (res.conversation_id) setConvId(res.conversation_id);

      const assistantMsg = {
        role: 'assistant',
        content: res.reply,
        charts: res.charts || [],
        tables: res.tables || [],
        cards: res.cards || [],
        details: res.details || [],
        suggestions: res.suggestions || [],
        _onSuggest: (s) => sendMessage(s),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, something went wrong: ${e.message}`,
        charts: [], tables: [], cards: [], details: [], suggestions: [],
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex h-[50px] w-[50px] items-center justify-center rounded-full shadow-lg transition-all hover:scale-105',
          open ? 'bg-muted border border-border text-foreground' : 'bg-primary text-primary-foreground'
        )}
        title="Retail Sync Assistant"
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        )}
      </button>

      {/* Slide-over panel */}
      <div
        className={cn(
          'fixed bottom-0 right-0 z-40 flex h-full w-[390px] max-w-[98vw] flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-[11px] font-bold text-white">AI</div>
            <div>
              <div className="text-[13px] font-semibold text-foreground">Retail Sync Assistant</div>
              <div className="text-[10px] text-muted-foreground">Powered by Gemini</div>
            </div>
          </div>
          <button
            onClick={() => { setMessages([]); setConvId(null); }}
            className="text-[10px] text-muted-foreground hover:text-foreground"
            title="Clear chat"
          >
            Clear
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-2xl">🤖</div>
              <div>
                <div className="text-[13px] font-semibold text-foreground">Hi, {user?.name?.split(' ')[0] || 'there'}!</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">Ask me anything about audits, stores, issues, or compliance.</div>
              </div>
              <div className="flex w-full flex-col gap-1.5">
                {starters.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s)}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-left text-[12px] text-foreground hover:bg-muted/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((m, i) => <Message key={i} msg={m} />)}
              {loading && (
                <div className="flex items-start gap-2">
                  <div className="rounded-tl-[3px] rounded-[12px] border border-border bg-card px-3 py-2.5">
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <span key={i} className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border bg-card p-3">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about audits, stores, issues…"
              className="text-[12.5px]"
              disabled={loading}
            />
            <Button
              size="sm"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="shrink-0 px-3"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>
            </Button>
          </div>
          <div className="mt-1.5 text-center text-[9.5px] text-muted-foreground">Read-only · Data from live PostgreSQL DB</div>
        </div>
      </div>

      {/* Backdrop (mobile) */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />
      )}
    </>
  );
}
