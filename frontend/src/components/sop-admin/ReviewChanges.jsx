import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Modal, ModalActions, ModalTitle } from '@/components/Modal'
import { labelClass } from '@/lib/utils'

import { describeField } from './editorLogic'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function Group({ title, items, render }) {
  if (!items.length) return null
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs font-bold text-foreground">{title} ({items.length})</div>
      <ul className="space-y-1 text-[12.5px] text-foreground/90">
        {items.map((item, i) => <li key={`${item.key ?? 'new'}-${i}`}>{render(item)}</li>)}
      </ul>
    </div>
  )
}

const kindWord = (item) => (item.kind === 'section' ? 'Section' : item.kind === 'tool' ? 'Tool' : 'Question')
const where = (item) => (item.section ? ` (in ${item.section})` : '')

// The step before publishing: what will change, who is not affected, and the
// required note. `serverErrors` are the 422 messages from the last attempt.
export default function ReviewChanges({
  open, diff, version, nextVersion, audits, note, onNote, busy, serverErrors,
  onClose, onPublish,
}) {
  const s = diff.summary
  return (
    <Modal open={open} onClose={busy ? undefined : onClose} className="w-[640px]">
      <ModalTitle>Review changes</ModalTitle>
      {s.total === 0 ? (
        <div className="text-sm text-muted-foreground">There is nothing to publish: the tool is the same as version {version}.</div>
      ) : (
        <>
          <div className="mb-3 text-sm text-foreground">
            <span className="font-semibold">{plural(s.total, 'change')}</span>: {s.added} added, {s.removed} removed, {s.changed} changed, {s.reordered} reordered.
          </div>
          <div className="mb-4 rounded-md bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
            {plural(audits, 'audit')} stay on version {version}. Scheduled audits that nobody has started move to version {nextVersion}.
          </div>
          <Group title="Added" items={diff.added} render={(a) => <>{kindWord(a)}: <b>{a.label}</b>{where(a)}</>} />
          <Group title="Removed" items={diff.removed} render={(a) => <>{kindWord(a)}: <b>{a.label}</b>{where(a)}</>} />
          <Group
            title="Changed" items={diff.changed}
            render={(c) => (
              <>
                {kindWord(c)}: <b>{c.label}</b>{where(c)}
                <ul className="ml-4 list-disc text-muted-foreground">
                  {c.fields.map((f) => <li key={f.field}>{describeField(f)}</li>)}
                </ul>
              </>
            )}
          />
          <Group
            title="Reordered" items={diff.reordered}
            render={(r) => <>{kindWord(r)}: <b>{r.label}</b>{where(r)} moves from position {r.from} to {r.to}</>}
          />
          <div className="mt-4">
            <label className={labelClass}>What changed and why (required)</label>
            <Textarea value={note} onChange={(e) => onNote(e.target.value)} placeholder="e.g. Raised marks for till count after the policy update" />
          </div>
        </>
      )}
      {serverErrors?.length > 0 && (
        <ul className="mt-3 list-disc rounded-md border border-red-200 bg-red-50 p-3 pl-6 text-[12.5px] text-red-700">
          {serverErrors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      <ModalActions>
        <Button variant="outline" disabled={busy} onClick={onClose}>Back to editing</Button>
        {s.total > 0 && (
          <Button disabled={busy || !note.trim()} onClick={onPublish}>
            {busy ? 'Publishing...' : `Publish version ${nextVersion}`}
          </Button>
        )}
      </ModalActions>
    </Modal>
  )
}
