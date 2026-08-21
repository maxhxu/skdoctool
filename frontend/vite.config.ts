import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Proxies API/auth calls to the FastAPI backend during local dev so the
// browser sees one origin and cookies behave normally (no CORS dance).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/activate': 'http://localhost:8000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
