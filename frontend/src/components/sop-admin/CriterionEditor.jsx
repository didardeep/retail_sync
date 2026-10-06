import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn, labelClass } from '@/lib/utils'

import { issuesFor } from './editorLogic'

function Problem({ issues, field }) {
  const found = issues.filter((i) => i.field === field)
  if (!found.length) return null
  return <div className="mt-1 text-[11.5px] font-medium text-red-600">{found.map((i) => i.message).join('; ')}</div>
}

function Field({ label, issues, field, children }) {
  const bad = issues.some((i) => i.field === field)
  return (
    <div className={cn(bad && '[&_input]:border-red-400 [&_textarea]:border-red-400')}>
      <label className={labelClass}>{label}</label>
      {children}
      <Problem issues={issues} field={field} />
    </div>
  )
}

// One question of a tool: wording, marks, the Best / Average / Least rubric and
// the proof flags. `issues` is the full validation list; this picks its own.
export default function CriterionEditor({
  criterion, section, index, allIssues, readOnly, canMoveUp, canMoveDown,
  onChange, onMove, onRemove,
}) {
  const issues = issuesFor(allIssues, section, index)
  const set = (patch) => onChange(patch)
  return (
    <div className="rounded-lg border border-border bg-background p-3" data-testid="criterion">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted-foreground">Question {index + 1}</span>
        {!readOnly && (
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Move question up">Up</Button>
            <Button type="button" size="sm" variant="outline" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Move question down">Down</Button>
            <Button type="button" size="sm" variant="outline" className="text-destructive" onClick={onRemove} aria-label="Remove question">Remove</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px]">
        <Field label="Question" issues={issues} field="title">
          <Textarea
            className="min-h-[64px]" value={criterion.title ?? ''} disabled={readOnly}
            onChange={(e) => set({ title: e.target.value })}
          />
        </Field>
        <Field label="Marks" issues={issues} field="marks">
          <Input
            type="number" min="0" step="0.5" inputMode="decimal" value={criterion.marks ?? ''} disabled={readOnly}
            onChange={(e) => set({ marks: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Best (full marks)" issues={issues} field="max_text">
          <Textarea className="min-h-[56px]" value={criterion.max_text ?? ''} disabled={readOnly} onChange={(e) => set({ max_text: e.target.value })} />
        </Field>
        <Field label="Average (optional)" issues={issues} field="avg_text">
          <Textarea className="min-h-[56px]" value={criterion.avg_text ?? ''} disabled={readOnly} onChange={(e) => set({ avg_text: e.target.value })} />
        </Field>
        <Field label="Least" issues={issues} field="min_text">
          <Textarea className="min-h-[56px]" value={criterion.min_text ?? ''} disabled={readOnly} onChange={(e) => set({ min_text: e.target.value })} />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-foreground">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!criterion.default_na} disabled={readOnly} onChange={(e) => set({ default_na: e.target.checked })} />
          N/A by default
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!criterion.requires_comment} disabled={readOnly} onChange={(e) => set({ requires_comment: e.target.checked })} />
          Comment required
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!criterion.requires_photo} disabled={readOnly} onChange={(e) => set({ requires_photo: e.target.checked })} />
          Photo required
        </label>
      </div>
    </div>
  )
}
