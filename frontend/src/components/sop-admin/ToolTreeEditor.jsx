import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { labelClass } from '@/lib/utils'

import CriterionEditor from './CriterionEditor'
import {
  addCriterion, addSection, issuesFor, moveCriterion, moveSection, removeCriterion,
  removeSection, totalMarks, updateCriterion, updateSection, updateTool,
} from './editorLogic'

function sectionMarks(section) {
  return section.criteria.reduce((sum, c) => (c.default_na ? sum : sum + (Number(c.marks) || 0)), 0)
}

// The whole editable tool: name, sections and their questions. It holds no
// state of its own; `onChange(nextTree)` receives each edit.
export default function ToolTreeEditor({ tree, issues, readOnly, onChange }) {
  const toolIssues = issuesFor(issues, null, null)
  const confirmRemove = (what) => window.confirm(`Remove ${what}? Audits already done keep it.`)

  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label className={labelClass}>Tool name</label>
            <Input value={tree.name ?? ''} disabled={readOnly} onChange={(e) => onChange(updateTool(tree, { name: e.target.value }))} />
            {toolIssues.map((i) => <div key={i.text} className="mt-1 text-[11.5px] font-medium text-red-600">{i.message}</div>)}
          </div>
          <div className="text-sm text-muted-foreground">
            Total <span className="font-bold text-foreground">{totalMarks(tree)}</span> marks
          </div>
        </div>
      </div>

      {tree.sections.map((sec, s) => {
        const secIssues = issuesFor(issues, s, null)
        return (
          <section key={sec._id ?? sec.key ?? s} className="rounded-[10px] border border-border bg-card p-4" data-testid="section">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Section {sec.code || s + 1}</Badge>
                <span className="text-xs text-muted-foreground">{sectionMarks(sec)} marks</span>
              </div>
              {!readOnly && (
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="outline" disabled={s === 0} onClick={() => onChange(moveSection(tree, s, -1))} aria-label="Move section up">Up</Button>
                  <Button type="button" size="sm" variant="outline" disabled={s === tree.sections.length - 1} onClick={() => onChange(moveSection(tree, s, 1))} aria-label="Move section down">Down</Button>
                  <Button
                    type="button" size="sm" variant="outline" className="text-destructive" aria-label="Remove section"
                    onClick={() => { if (!sec.criteria.length || confirmRemove(`section ${sec.code || s + 1}`)) onChange(removeSection(tree, s)) }}
                  >Remove</Button>
                </div>
              )}
            </div>
            <div className="mb-3">
              <label className={labelClass}>Section name</label>
              <Input value={sec.name ?? ''} disabled={readOnly} onChange={(e) => onChange(updateSection(tree, s, { name: e.target.value }))} />
              {secIssues.map((i) => <div key={i.text} className="mt-1 text-[11.5px] font-medium text-red-600">{i.message}</div>)}
            </div>

            <div className="space-y-3">
              {sec.criteria.map((c, i) => (
                <CriterionEditor
                  key={c._id ?? c.key ?? i}
                  criterion={c} section={s} index={i} allIssues={issues} readOnly={readOnly}
                  canMoveUp={i > 0} canMoveDown={i < sec.criteria.length - 1}
                  onChange={(patch) => onChange(updateCriterion(tree, s, i, patch))}
                  onMove={(delta) => onChange(moveCriterion(tree, s, i, delta))}
                  onRemove={() => { if (confirmRemove(`question ${i + 1}`)) onChange(removeCriterion(tree, s, i)) }}
                />
              ))}
            </div>
            {!readOnly && (
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => onChange(addCriterion(tree, s))}>+ Add question</Button>
            )}
          </section>
        )
      })}

      {!readOnly && <Button type="button" variant="outline" onClick={() => onChange(addSection(tree))}>+ Add section</Button>}
    </div>
  )
}
