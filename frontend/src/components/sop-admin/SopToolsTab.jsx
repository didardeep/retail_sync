import { useState } from 'react'
import { Link } from 'react-router-dom'

import { sopAdminApi } from '@/api/sopAdmin'
import { useApi } from '@/components/useApi'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { sopToolEditorLink } from '@/lib/links'

export function formatDate(iso) {
  if (!iso) return 'not recorded'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'not recorded' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export function VersionHistory({ tool }) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {tool.versions.map((v) => (
        <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground">
              Version {v.version}
              {v.is_current && <Badge className="ml-2 bg-emerald-50 text-[10px] text-emerald-700" variant="outline">Current</Badge>}
            </div>
            <div className="text-muted-foreground">
              {formatDate(v.published_at)}{v.created_by ? ` by ${v.created_by}` : ''}
              {' - '}{v.change_note || 'no note'}
            </div>
            <div className="text-muted-foreground">
              {v.total_marks} marks, {plural(v.criterion_count, 'question')}, {plural(v.audit_count, 'audit')}
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to={`${sopToolEditorLink(tool.code)}?version=${v.version}`}>View</Link>
          </Button>
        </li>
      ))}
    </ul>
  )
}

function ToolCard({ tool }) {
  const [open, setOpen] = useState(false)
  const cur = tool.current
  return (
    <div className="rounded-[10px] border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold text-foreground">{tool.name}</span>
            <Badge variant="secondary">{tool.code}</Badge>
            <Badge variant="outline">Version {cur.version}</Badge>
            {!tool.is_active && <Badge variant="destructive">Inactive</Badge>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {cur.total_marks} marks - {plural(cur.section_count, 'section')} - {plural(cur.criterion_count, 'question')}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Last published {formatDate(cur.published_at)}{cur.created_by ? ` by ${cur.created_by}` : ''}
            {cur.change_note ? ` - ${cur.change_note}` : ''}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {plural(tool.audit_count, 'audit')} done or in progress, {cur.planned_count} scheduled
          </div>
        </div>
        <Button asChild size="sm">
          <Link to={sopToolEditorLink(tool.code)}>Edit</Link>
        </Button>
      </div>

      <button
        type="button"
        className="mt-3 text-xs font-semibold text-primary"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide' : 'Show'} version history ({tool.versions.length})
      </button>
      {open && <div className="mt-2"><VersionHistory tool={tool} /></div>}
    </div>
  )
}

// The list itself, separate from the fetch so it can be rendered with fixture data.
export function ToolCards({ tools }) {
  if (!tools.length) {
    return <div className="rounded-[10px] border border-border bg-card p-10 text-center text-muted-foreground">No audit tools yet</div>
  }
  return <div className="grid gap-3 lg:grid-cols-2">{tools.map((t) => <ToolCard key={t.code} tool={t} />)}</div>
}

export default function SopToolsTab() {
  const { data, error, loading, reload } = useApi(() => sopAdminApi.tools(), [])
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        Editing a tool publishes a new version. Audits already started or finished keep the version they were done on.
      </div>
      {loading && <div className="p-6 text-center text-muted-foreground">Loading audit tools...</div>}
      {error && (
        <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
          <Button size="sm" variant="outline" onClick={reload}>Retry</Button>
        </div>
      )}
      {data && <ToolCards tools={data} />}
    </div>
  )
}
