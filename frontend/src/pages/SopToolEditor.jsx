import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { sopAdminApi } from '@/api/sopAdmin'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import ReviewChanges from '@/components/sop-admin/ReviewChanges'
import ToolTreeEditor from '@/components/sop-admin/ToolTreeEditor'
import {
  diffTrees, draftKey, prepareTree, toPayload, validateTree,
} from '@/components/sop-admin/editorLogic'
import { questionsLink, sopToolEditorLink } from '@/lib/links'

// The unsaved working copy lives in this browser only; every access can fail
// (private window, blocked storage), and the editor works without it.
function readDraft(key) {
  try {
    const text = localStorage.getItem(key)
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function writeDraft(key, tree) {
  try {
    if (tree) localStorage.setItem(key, JSON.stringify(tree))
    else localStorage.removeItem(key)
  } catch {
    // no storage: the working copy just is not kept across reloads
  }
}

function Banner({ tone = 'info', children }) {
  const colors = tone === 'warn'
    ? 'border-amber-300 bg-amber-50 text-amber-900'
    : 'border-sky-200 bg-sky-50 text-sky-900'
  return <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-[13px] ${colors}`}>{children}</div>
}

// The editor screen without any loading or saving logic, so it can be rendered
// from fixture data. SopToolEditor below wires it to the API and localStorage.
export function EditorScreen({
  code, tree, issues, readOnly, version, hasDraft, staleVersion,
  review, onChange, onRestore, onDiscard, onReload, onOpenReview,
}) {
  const nextVersion = version + 1
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={questionsLink({ tab: 'sop-tools' })} className="text-xs font-semibold text-primary">Back to SOP tools</Link>
          <h2 className="mt-1 text-xl font-bold text-foreground">
            {readOnly ? 'Version' : 'Edit'} {tree.name || code}
            <span className="ml-2 text-sm font-medium text-muted-foreground">
              {readOnly ? `v${version} (read-only)` : `v${version} -> v${nextVersion}`}
            </span>
          </h2>
        </div>
        {!readOnly && (
          <div className="flex flex-col items-end gap-1">
            <Button disabled={issues.length > 0} onClick={onOpenReview}>Review changes</Button>
            {issues.length > 0 && (
              <span className="text-xs font-medium text-red-600">Fix {issues.length} problem{issues.length === 1 ? '' : 's'} to continue</span>
            )}
          </div>
        )}
      </div>

      {readOnly && (
        <Banner>
          You are looking at an older version. It cannot be changed.
          <Link to={sopToolEditorLink(code)} className="font-semibold underline">Edit the current version</Link>
        </Banner>
      )}
      {hasDraft && (
        <Banner tone="warn">
          Restore unsaved changes?
          <Button size="sm" onClick={onRestore}>Restore</Button>
          <Button size="sm" variant="outline" onClick={onDiscard}>Discard</Button>
        </Banner>
      )}
      {staleVersion != null && (
        <Banner tone="warn">
          Someone published version {staleVersion} while you were editing. Reload to start from it; your unsaved copy is kept in this browser.
          <Button size="sm" onClick={onReload}>Reload</Button>
        </Banner>
      )}

      <ToolTreeEditor tree={tree} issues={issues} readOnly={readOnly} onChange={onChange} />
      {review}
    </div>
  )
}

export default function SopToolEditor() {
  const { code } = useParams()
  const [params] = useSearchParams()
  const viewing = params.get('version')
  const readOnly = !!viewing
  const navigate = useNavigate()
  const toast = useToast()

  const [loadState, setLoadState] = useState({ loading: true, error: null })
  const [baseline, setBaseline] = useState(null)
  const [tree, setTree] = useState(null)
  const [version, setVersion] = useState(null)
  const [auditCount, setAuditCount] = useState(0)
  const [pendingDraft, setPendingDraft] = useState(null)
  const [staleVersion, setStaleVersion] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [serverErrors, setServerErrors] = useState([])
  const published = useRef(false)

  const load = useCallback(() => {
    let ignore = false
    setLoadState({ loading: true, error: null })
    setStaleVersion(null)
    setReviewOpen(false)
    const request = viewing ? sopAdminApi.version(code, viewing) : sopAdminApi.current(code)
    request.then((res) => {
      if (ignore) return
      const loaded = prepareTree(res.tree)
      setBaseline(loaded)
      setTree(loaded)
      setVersion(viewing ? Number(viewing) : res.base_version)
      setAuditCount(res.audit_count ?? 0)
      setLoadState({ loading: false, error: null })
      if (!viewing) {
        const saved = readDraft(draftKey(code, res.base_version))
        if (saved && diffTrees(loaded, saved).summary.total > 0) setPendingDraft(prepareTree(saved))
        else setPendingDraft(null)
      }
    }).catch((error) => {
      if (!ignore) setLoadState({ loading: false, error })
    })
    return () => { ignore = true }
  }, [code, viewing])

  useEffect(load, [load])

  // Autosave the working copy while it differs from what the server has. It
  // waits while a saved copy is still waiting to be restored or discarded.
  useEffect(() => {
    if (readOnly || !baseline || !tree || pendingDraft || published.current) return
    const changed = diffTrees(baseline, tree).summary.total > 0
    writeDraft(draftKey(code, version), changed ? tree : null)
  }, [tree, baseline, pendingDraft, readOnly, code, version])

  if (loadState.loading) {
    return <div className="flex h-[40vh] items-center justify-center text-muted-foreground">Loading audit tool...</div>
  }
  if (loadState.error || !tree) {
    return (
      <div className="mx-auto max-w-xl rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {loadState.error?.status === 404 ? `There is no audit tool ${code}.` : (loadState.error?.message || 'Could not load the tool.')}
        <div className="mt-3"><Link to={questionsLink({ tab: 'sop-tools' })} className="font-semibold underline">Back to SOP tools</Link></div>
      </div>
    )
  }

  const issues = readOnly ? [] : validateTree(tree)
  const diff = diffTrees(baseline, tree)

  async function publish() {
    setBusy(true)
    setServerErrors([])
    try {
      const res = await sopAdminApi.publish(code, {
        tree: toPayload(tree), base_version: version, change_note: note.trim(),
      })
      published.current = true
      writeDraft(draftKey(code, version), null)
      toast(res.unchanged ? 'No changes to publish' : `Published version ${res.version}`)
      navigate(questionsLink({ tab: 'sop-tools' }))
    } catch (err) {
      if (err.status === 409) {
        setReviewOpen(false)
        setStaleVersion(err.detail?.current_version ?? null)
      } else if (err.status === 422 && err.detail?.errors) {
        setServerErrors(err.detail.errors)
      } else {
        toast.error(err.message)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <EditorScreen
      code={code} tree={tree} issues={issues} readOnly={readOnly} version={version}
      hasDraft={!!pendingDraft} staleVersion={staleVersion}
      onChange={setTree}
      onRestore={() => { setTree(pendingDraft); setPendingDraft(null) }}
      onDiscard={() => { writeDraft(draftKey(code, version), null); setPendingDraft(null) }}
      onReload={load}
      onOpenReview={() => { setServerErrors([]); setReviewOpen(true) }}
      review={(
        <ReviewChanges
          open={reviewOpen} diff={diff} version={version} nextVersion={version + 1}
          audits={auditCount} note={note} onNote={setNote} busy={busy}
          serverErrors={serverErrors} onClose={() => setReviewOpen(false)} onPublish={publish}
        />
      )}
    />
  )
}
