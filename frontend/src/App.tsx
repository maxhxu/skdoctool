import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { MyFilesPage, ExplorePage } from './pages/FileListPages'
import { NewFilePage } from './pages/NewFilePage'
import { FileViewPage } from './pages/FileViewPage'
import { ProfilePage } from './pages/ProfilePage'
import { EmbedPage } from './pages/EmbedPage'
import { isEmbedMode } from './lib/embed'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="muted">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

/**
 * Framed on someone else's site, a file renders as a bare embed instead of the
 * full workspace — see lib/embed.ts. Its own route tree, with no AuthProvider:
 * an embed is view-only whether or not the frame happens to carry a session,
 * so there's nothing for it to ask /api/me about.
 */
function EmbedApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/files/:id" element={<EmbedPage />} />
        <Route path="*" element={<p className="embed-message">Only a file can be embedded.</p>} />
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  if (isEmbedMode()) return <EmbedApp />

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/u/:username" element={<ProfilePage />} />
            <Route path="/files/:id" element={<FileViewPage />} />
            <Route
              path="/files"
              element={
                <RequireAuth>
                  <MyFilesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/files/new"
              element={
                <RequireAuth>
                  <NewFilePage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
