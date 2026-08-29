import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ApiError,
  filesApi,
  type Collaborator,
  type FileDetail,
  type Revision,
  type Suggestion,
} from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { getRenderer, FILE_KINDS } from '../components/rendererRegistry'
import { MarkdownEditor } from '../components/MarkdownEditor'
import { DiffView } from '../components/DiffView'

type Tab = 'view' | 'edit' | 'suggest' | 'history' | 'contributions' | 'settings'

export function FileViewPage() {
  const { id } = useParams<{ id: string }>()
  const fileId = Number(id)
  const { user } = useAuth()

  const [detail, setDetail] = useState<FileDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('view')

  const load = useCallback(async () => {
    try {
      setDetail(await filesApi.get(fileId))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load file')
    }
  }, [fileId])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <div className="error-banner">{error}</div>
  if (!detail) return <p className="muted">Loading…</p>

  const { file, content, can_edit, is_owner } = detail
  const Renderer = getRenderer(file.kind)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'view', label: 'View' },
    ...(can_edit ? [{ key: 'edit' as Tab, label: 'Edit' }] : []),
    ...(!can_edit && user ? [{ key: 'suggest' as Tab, label: 'Suggest a change' }] : []),
    { key: 'history', label: 'History' },
    ...(can_edit ? [{ key: 'contributions' as Tab, label: 'Contributions' }] : []),
    ...(is_owner ? [{ key: 'settings' as Tab, label: 'Settings' }] : []),
  ]

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <h1 className="page-title" style={{ marginBottom: '0.2rem' }}>
            {file.title}
          </h1>
          <div className="row muted" style={{ fontSize: '0.85rem' }}>
            <span className="mono">{file.kind}</span>
            <span className={`pill ${file.visibility === 'private' ? 'private' : ''}`}>{file.visibility}</span>
          </div>
        </div>
      </div>

      <div className="row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'primary' : 'subtle'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'view' && (
        <Renderer content={content} />
      )}
      {tab === 'edit' && can_edit && <EditPanel detail={detail} onSaved={load} />}
      {tab === 'suggest' && user && <SuggestPanel fileId={file.id} baseRevisionId={file.head_revision_id} baseContent={content} kind={file.kind} />}
      {tab === 'history' && <HistoryPanel fileId={file.id} />}
      {tab === 'contributions' && can_edit && <ContributionsPanel fileId={file.id} onAccepted={load} />}
      {tab === 'settings' && is_owner && <SettingsPanel detail={detail} onSaved={load} />}
    </div>
  )
}

// ---- edit -----------------------------------------------------------------

function EditPanel({ detail, onSaved }: { detail: FileDetail; onSaved: () => void }) {
  const [content, setContent] = useState(detail.content)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await filesApi.createRevision(detail.file.id, {
        content,
        message,
        parent_revision_id: detail.file.head_revision_id,
      })
      setMessage('')
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('This file changed since you loaded it. Reload and reapply your edit.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to save')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack">
      {error && <div className="error-banner">{error}</div>}
      <MarkdownEditor content={content} onChange={setContent} kind={detail.file.kind} />
      <div className="row">
        <input
          type="text"
          placeholder="What changed? (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="primary" onClick={save} disabled={saving || content === detail.content}>
          {saving ? 'Saving…' : 'Save revision'}
        </button>
      </div>
    </div>
  )
}

// ---- suggest ----------------------------------------------------------

function SuggestPanel({
  fileId,
  baseRevisionId,
  baseContent,
  kind,
}: {
  fileId: number
  baseRevisionId: number
  baseContent: string
  kind: string
}) {
  const [content, setContent] = useState(baseContent)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit() {
    setError(null)
    try {
      await filesApi.createSuggestion(fileId, { content, message, base_revision_id: baseRevisionId })
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit suggestion')
    }
  }

  if (sent) {
    return <p>Sent — the owner or an editor will review it as a diff against the current version.</p>
  }

  return (
    <div className="stack">
      <p className="muted">
        You can view this file but can't edit it directly. Propose a change instead — the owner reviews
        it as a diff and can accept or reject it.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <MarkdownEditor content={content} onChange={setContent} kind={kind} />
      <div className="row">
        <input
          type="text"
          placeholder="Why this change? (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="primary" onClick={submit} disabled={content === baseContent}>
          Submit suggestion
        </button>
      </div>
    </div>
  )
}

// ---- history ------------------------------------------------------------

function HistoryPanel({ fileId }: { fileId: number }) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null)
  const [compareFrom, setCompareFrom] = useState<number | null>(null)
  const [compareTo, setCompareTo] = useState<number | null>(null)
  const [diff, setDiff] = useState<Awaited<ReturnType<typeof filesApi.diff>>['diff'] | null>(null)

  useEffect(() => {
    filesApi.revisions(fileId).then((r) => {
      setRevisions(r.revisions)
      if (r.revisions.length >= 2) {
        setCompareFrom(r.revisions[1].id)
        setCompareTo(r.revisions[0].id)
      }
    })
  }, [fileId])

  useEffect(() => {
    if (compareFrom && compareTo) {
      filesApi.diff(fileId, compareFrom, compareTo).then((r) => setDiff(r.diff))
    }
  }, [fileId, compareFrom, compareTo])

  if (!revisions) return <p className="muted">Loading…</p>
  if (revisions.length === 0) return <p className="muted">No revisions yet.</p>

  return (
    <div className="stack">
      <div className="stack">
        {revisions.map((r) => (
          <div key={r.id} className="row-between card">
            <div>
              <div>{r.message || <span className="muted">(no message)</span>}</div>
              <div className="muted mono" style={{ fontSize: '0.8rem' }}>
                @{r.author_username} · revision {r.id}
              </div>
            </div>
            <div className="row" style={{ fontSize: '0.8rem' }}>
              <button className="subtle" onClick={() => setCompareFrom(r.id)}>
                {compareFrom === r.id ? 'From ✓' : 'Diff from here'}
              </button>
              <button className="subtle" onClick={() => setCompareTo(r.id)}>
                {compareTo === r.id ? 'To ✓' : 'Diff to here'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {diff && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>
            Diff: revision {compareFrom} → {compareTo}
          </h4>
          <DiffView diff={diff} />
        </div>
      )}
    </div>
  )
}

// ---- contributions (owner/editor review) -----------------------------

function ContributionsPanel({ fileId, onAccepted }: { fileId: number; onAccepted: () => void }) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [openDiffs, setOpenDiffs] = useState<Record<number, Awaited<ReturnType<typeof filesApi.suggestionDiff>>['diff']>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    filesApi.suggestions(fileId).then((r) => setSuggestions(r.suggestions))
  }, [fileId])

  useEffect(() => {
    load()
  }, [load])

  async function toggleDiff(s: Suggestion) {
    if (openDiffs[s.id]) {
      setOpenDiffs((d) => {
        const next = { ...d }
        delete next[s.id]
        return next
      })
      return
    }
    const { diff } = await filesApi.suggestionDiff(fileId, s.id)
    setOpenDiffs((d) => ({ ...d, [s.id]: diff }))
  }

  async function accept(s: Suggestion) {
    setError(null)
    try {
      await filesApi.acceptSuggestion(fileId, s.id)
      load()
      onAccepted()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('This suggestion is stale — the file has changed since it was proposed. Refresh to see the current version.')
        load()
        onAccepted()
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to accept')
      }
    }
  }

  async function reject(s: Suggestion) {
    setError(null)
    try {
      await filesApi.rejectSuggestion(fileId, s.id)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reject')
    }
  }

  if (!suggestions) return <p className="muted">Loading…</p>
  const pending = suggestions.filter((s) => s.status === 'pending')
  const resolved = suggestions.filter((s) => s.status !== 'pending')

  return (
    <div className="stack">
      {error && <div className="error-banner">{error}</div>}
      {pending.length === 0 && <p className="muted">No pending contributions.</p>}
      {pending.map((s) => (
        <div key={s.id} className="card stack">
          <div className="row-between">
            <div>
              <strong>@{s.author_username}</strong>{' '}
              <span className="muted">{s.message || 'proposed a change'}</span>
            </div>
            <div className="row">
              <button className="subtle" onClick={() => toggleDiff(s)}>
                {openDiffs[s.id] ? 'Hide diff' : 'Show diff'}
              </button>
              <button className="primary" onClick={() => accept(s)}>
                Accept
              </button>
              <button className="danger" onClick={() => reject(s)}>
                Reject
              </button>
            </div>
          </div>
          {openDiffs[s.id] && <DiffView diff={openDiffs[s.id]} />}
        </div>
      ))}
      {resolved.length > 0 && (
        <details>
          <summary className="muted">{resolved.length} resolved</summary>
          <div className="stack" style={{ marginTop: '0.6rem' }}>
            {resolved.map((s) => (
              <div key={s.id} className="row-between">
                <span>
                  @{s.author_username} — {s.message || 'proposed a change'}
                </span>
                <span className="pill">{s.status}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ---- settings (owner: meta + collaborators) ---------------------------

function SettingsPanel({ detail, onSaved }: { detail: FileDetail; onSaved: () => void }) {
  const [title, setTitle] = useState(detail.file.title)
  const [kind, setKind] = useState(detail.file.kind)
  const [visibility, setVisibility] = useState(detail.file.visibility)
  const [collaborators, setCollaborators] = useState<Collaborator[] | null>(null)
  const [newCollaborator, setNewCollaborator] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loadCollaborators = useCallback(() => {
    filesApi.collaborators(detail.file.id).then((r) => setCollaborators(r.collaborators))
  }, [detail.file.id])

  useEffect(() => {
    loadCollaborators()
  }, [loadCollaborators])

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await filesApi.updateMeta(detail.file.id, { title, kind, visibility })
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save')
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const r = await filesApi.addCollaborator(detail.file.id, newCollaborator.trim().toLowerCase())
      setCollaborators(r.collaborators)
      setNewCollaborator('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to invite')
    }
  }

  async function removeCollab(userId: number) {
    await filesApi.removeCollaborator(detail.file.id, userId)
    loadCollaborators()
  }

  return (
    <div className="stack">
      {error && <div className="error-banner">{error}</div>}
      <form className="stack" onSubmit={saveMeta}>
        <div>
          <label htmlFor="s-title">Title</label>
          <input id="s-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="s-kind">Kind</label>
          <select id="s-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {FILE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="s-vis">Visibility</label>
          <select id="s-vis" value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}>
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </div>
        <button className="primary" type="submit">
          Save settings
        </button>
      </form>

      <div className="stack">
        <h3 style={{ marginBottom: '0.3rem' }}>Editors</h3>
        {collaborators?.map((c) => (
          <div key={c.user_id} className="row-between">
            <span>@{c.username}</span>
            <button className="subtle" onClick={() => removeCollab(c.user_id)}>
              Remove
            </button>
          </div>
        ))}
        {collaborators?.length === 0 && <p className="muted">No invited editors yet.</p>}
        <form className="row" onSubmit={invite}>
          <input
            type="text"
            placeholder="username"
            value={newCollaborator}
            onChange={(e) => setNewCollaborator(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit">Invite as editor</button>
        </form>
      </div>
    </div>
  )
}
