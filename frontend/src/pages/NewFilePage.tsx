import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, filesApi } from '../lib/api'
import { FILE_KINDS } from '../components/rendererRegistry'

const TEMPLATES: Record<string, string> = {
  doc: '# Untitled\n\nStart writing.\n',
  'decision-tree': `---
kind: decision-tree
---

:::node id="start" title="Welcome" start="true"
Describe the first moment.

[First choice](#a)
[Second choice](#b)
:::

:::node id="a" title="Branch A"
What happens here.
:::

:::node id="b" title="Branch B"
What happens here.
:::
`,
  quiz: `---
kind: quiz
---

:::question title="Your first question?"
- [ ] Wrong answer
- [x] Right answer
- [ ] Another wrong one
:::
`,
}

export function NewFilePage() {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('doc')
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const file = await filesApi.create({
        title: title.trim() || 'Untitled',
        kind,
        visibility,
        content: TEMPLATES[kind] ?? TEMPLATES.doc,
      })
      navigate(`/files/${file.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <h1 className="page-title">New file</h1>
      {error && <div className="error-banner">{error}</div>}
      <div>
        <label htmlFor="title">Title</label>
        <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="kind">Kind</label>
        <select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {FILE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="visibility">Visibility</label>
        <select id="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}>
          <option value="private">Private — only you and invited editors</option>
          <option value="public">Public — anyone can view and suggest edits</option>
        </select>
      </div>
      <button className="primary" type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create file'}
      </button>
    </form>
  )
}
