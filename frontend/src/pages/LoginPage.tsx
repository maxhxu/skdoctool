import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, authApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const expired = params.get('error') === 'expired'

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await authApi.login(username, password)
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="stack" style={{ maxWidth: '24rem' }} onSubmit={submit}>
      <h1 className="page-title">Log in</h1>
      {expired && (
        <div className="error-banner">Your session expired. Log in again.</div>
      )}
      {error && <div className="error-banner">{error}</div>}
      <div>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
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
          autoComplete="current-password"
          required
        />
      </div>
      <button className="primary" type="submit" disabled={submitting}>
        {submitting ? 'Logging in…' : 'Log in'}
      </button>
      <p className="muted">
        No account yet? <Link to="/register">Create one</Link>.
      </p>
    </form>
  )
}
