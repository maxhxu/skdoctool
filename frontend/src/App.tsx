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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="muted">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
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
