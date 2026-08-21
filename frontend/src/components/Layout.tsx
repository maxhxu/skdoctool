import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Icon } from './Icon'

function navClass({ isActive }: { isActive: boolean }) {
  return `nav-link${isActive ? ' active' : ''}`
}

export function Layout() {
  const { user, loading } = useAuth()

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <a href="/" style={{ textDecoration: 'none' }}>
              <span className="brand-mark">sk</span>doctool
            </a>
          </div>
          {!loading && (user ? <UserMenu username={user.username} /> : (
            <NavLink to="/login" className="nav-link topbar-login">
              <Icon name="log-in" /> Log in
            </NavLink>
          ))}
        </div>
      </header>

      <div className="app-shell">
        <aside className="sidebar">
          <nav className="nav-group">
            <div className="nav-section">
              <div className="nav-section-title">Browse</div>
              <NavLink to="/" end className={navClass}>
                Home
              </NavLink>
              <NavLink to="/explore" className={navClass}>
                Explore public files
              </NavLink>
            </div>

            {!loading && user && (
              <div className="nav-section">
                <div className="nav-section-title">Workspace</div>
                <NavLink to="/files" end className={navClass}>
                  My files
                </NavLink>
                <NavLink to="/files/new" className={navClass}>
                  New file
                </NavLink>
              </div>
            )}
          </nav>
        </aside>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function UserMenu({ username }: { username: string }) {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function dropdownClass({ isActive }: { isActive: boolean }) {
    return `user-menu-item${isActive ? ' active' : ''}`
  }

  return (
    <div className="user-menu" ref={ref}>
      <button className="user-menu-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="user-avatar">{username.slice(0, 1).toUpperCase()}</span>
        <span className="mono">@{username}</span>
        <Icon name="chevron-down" className={`user-menu-chevron${open ? ' open' : ''}`} />
      </button>
      {open && (
        <div className="user-menu-dropdown">
          <NavLink to={`/u/${username}`} className={dropdownClass} onClick={() => setOpen(false)}>
            <Icon name="user" /> My profile
          </NavLink>
          <div className="user-menu-divider" />
          <button
            className="user-menu-item"
            onClick={() => {
              setOpen(false)
              logout()
            }}
          >
            <Icon name="log-out" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}
