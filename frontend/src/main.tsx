import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startTheme } from './lib/theme.ts'

// Outside React on purpose: index.html has already put the theme on <html>
// before first paint, so this only picks up the live sources (an OS switch, a
// toggle in another tab) — there's nothing to tie to a component's lifetime.
startTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
