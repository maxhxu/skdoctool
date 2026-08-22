import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, authApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export function RegisterPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { refresh } = useAuth()
  const navigate = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await authApi.register(username.toLowerCase(), password)
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <h1 className="page-title">Create an account</h1>
      <p className="muted">Pick a username and password. That's it — no email required.</p>
      {error && <div className="error-banner">{error}</div>}
      <div>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]{3,20}"
          title="3-20 characters: letters, digits, underscore"
          placeholder="e.g. ada99"
          autoComplete="username"
          required
          autoFocus
        />
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          required
        />
      </div>
      <button className="primary" type="submit" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create account'}
      </button>
      <p className="muted">
        Already have an account? <Link to="/login">Log in</Link>.
      </p>
    </form>
  )
}
