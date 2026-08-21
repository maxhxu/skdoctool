import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ApiError, profileApi, type ProfileResponse, type SocialLink } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const { user: currentUser } = useAuth()
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const load = useCallback(() => {
    if (!username) return
    profileApi
      .get(username)
      .then(setProfile)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load profile'))
  }, [username])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <div className="error-banner">{error}</div>
  if (!profile) return <p className="muted">Loading…</p>

  const isOwn = currentUser?.username === profile.user.username

  return (
    <div className="stack">
      <div className="row-between">
        <h1 className="page-title">@{profile.user.username}</h1>
        {isOwn && (
          <button className="subtle" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done editing' : 'Edit profile'}
          </button>
        )}
      </div>

      {editing ? (
        <ProfileEditor profile={profile} onSaved={() => { load(); setEditing(false) }} />
      ) : (
        <>
          {profile.social_links.length > 0 && (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {profile.social_links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                  <button className="subtle">{l.label}</button>
                </a>
              ))}
            </div>
          )}
          <div className="card md-body">
            {profile.bio_markdown ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{profile.bio_markdown}</ReactMarkdown>
            ) : (
              <p className="muted">No bio yet.</p>
            )}
          </div>
        </>
      )}

      <div>
        <h3>Public files</h3>
        {profile.public_files.length === 0 ? (
          <p className="muted">No public files.</p>
        ) : (
          <div className="file-list">
            {profile.public_files.map((f) => (
              <Link key={f.id} to={`/files/${f.id}`} className="file-row">
                <span className="file-row-title">{f.title}</span>
                <span className="mono muted">{f.kind}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ProfileEditor({ profile, onSaved }: { profile: ProfileResponse; onSaved: () => void }) {
  const [bio, setBio] = useState(profile.bio_markdown)
  const [links, setLinks] = useState<SocialLink[]>(profile.social_links)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function updateLink(i: number, patch: Partial<SocialLink>) {
    setLinks((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function save() {
    setError(null)
    setSaving(true)
    try {
      await profileApi.updateBio(bio)
      await profileApi.updateLinks(links.filter((l) => l.label.trim() && l.url.trim()))
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div>
        <label htmlFor="bio">Bio (markdown)</label>
        <textarea id="bio" rows={8} value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>
      <div>
        <label>Social links</label>
        <div className="stack">
          {links.map((l, i) => (
            <div key={i} className="row">
              <input
                type="text"
                placeholder="Label"
                value={l.label}
                onChange={(e) => updateLink(i, { label: e.target.value })}
                style={{ maxWidth: '8rem' }}
              />
              <input
                type="url"
                placeholder="https://…"
                value={l.url}
                onChange={(e) => updateLink(i, { url: e.target.value })}
                style={{ flex: 1 }}
              />
              <button className="subtle" onClick={() => setLinks((ls) => ls.filter((_, idx) => idx !== i))}>
                Remove
              </button>
            </div>
          ))}
          <button className="subtle" onClick={() => setLinks((ls) => [...ls, { label: '', url: '' }])}>
            + Add link
          </button>
        </div>
      </div>
      <button className="primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save profile'}
      </button>
    </div>
  )
}
