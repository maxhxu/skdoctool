// Light/dark palette selection. Deliberately client-only: which palette you
// read in is a display preference, not account state, so there's no API call,
// no server column, and it works logged out.
//
// The whole palette is CSS custom properties on `:root` (see index.css), so
// switching themes is one attribute on <html>: `data-theme="light" | "dark"`.
// index.html stamps that attribute inline, before first paint, from the same
// rules below — otherwise every load would flash the light palette first.
//
// Resolution order, highest priority first:
//
//   1. `?theme=` on the URL. This is how an *embedding* site picks a palette:
//      its frame can't see our localStorage, since browsers partition storage
//      by top-level site (and Safari blocks it outright in a third-party
//      frame), so the preference has to travel in the iframe URL.
//   2. A `skdoctool:theme` postMessage from the host page — same reason, but
//      live, so a host with its own dark-mode switch can keep the frame in
//      step with it instead of reloading the iframe.
//   3. The stored preference, i.e. the toggle on /settings.
//   4. `prefers-color-scheme`. This one *does* cross into a third-party frame,
//      so with no host cooperation at all an embed still follows the reader's
//      own system dark mode. It's why 'system' is the default rather than
//      'light'.

import { useCallback, useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/** Kept in sync with the pre-paint script in index.html. */
export const THEME_STORAGE_KEY = 'skdoctool:theme'

/** postMessage payload a host page can send to re-theme an embedded file. */
export const EMBED_THEME_MESSAGE = 'skdoctool:theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

/** `?theme=dark` on any URL, including the one a host frames. */
export function parseThemeParam(search: string): ThemePreference | null {
  const value = new URLSearchParams(search).get('theme')
  return isThemePreference(value) ? value : null
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

/**
 * Reading localStorage *throws* (not returns null) in a third-party frame with
 * storage blocked, so every access goes through here. An embed that can't read
 * it just falls through to `prefers-color-scheme`, which is the right answer
 * there anyway.
 */
function withStorage<T>(fn: (storage: Storage) => T, fallback: T): T {
  try {
    return fn(window.localStorage)
  } catch {
    return fallback
  }
}

export function readStoredTheme(): ThemePreference {
  const stored = withStorage((s) => s.getItem(THEME_STORAGE_KEY), null)
  return isThemePreference(stored) ? stored : 'system'
}

function darkMediaQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
}

function systemPrefersDark(): boolean {
  return darkMediaQuery()?.matches ?? false
}

// --- the store ------------------------------------------------------------
// A module-level store rather than a context: the pre-paint script already put
// the theme on <html> before React exists, and both route trees (app and
// embed) need it, so there's nothing for a provider to own.

let preference: ThemePreference = 'system'
const listeners = new Set<() => void>()

export function getThemePreference(): ThemePreference {
  return preference
}

export function getResolvedTheme(): ResolvedTheme {
  return resolveTheme(preference, systemPrefersDark())
}

function applyTheme() {
  document.documentElement.dataset.theme = getResolvedTheme()
}

/**
 * @param persist false for a preference that came from outside — a `?theme=`
 * or a host's postMessage is the *embedding page's* choice, not the reader's,
 * and shouldn't overwrite the toggle they set on /settings.
 */
export function setThemePreference(next: ThemePreference, { persist = true } = {}) {
  if (persist) withStorage((s) => s.setItem(THEME_STORAGE_KEY, next), undefined)
  if (next === preference) return
  preference = next
  applyTheme()
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Picks up the initial preference and keeps it live. Called once from main.tsx,
 * for both the app and the embed — the difference between them is only where
 * the preference is allowed to come from, which the resolution order handles.
 */
export function startTheme(): () => void {
  preference = parseThemeParam(window.location.search) ?? readStoredTheme()
  applyTheme()

  const media = darkMediaQuery()
  // 'system' has to re-resolve when the OS flips, and the resolved value never
  // lives in `preference`, so re-apply on every change and let the no-op case
  // be cheap.
  const onSystemChange = () => {
    applyTheme()
    listeners.forEach((listener) => listener())
  }
  media?.addEventListener('change', onSystemChange)

  // Another tab's /settings toggle. `storage` only fires in *other* tabs.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return
    setThemePreference(isThemePreference(event.newValue) ? event.newValue : 'system', {
      persist: false,
    })
  }
  window.addEventListener('storage', onStorage)

  return () => {
    media?.removeEventListener('change', onSystemChange)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * Host pages can re-theme a framed file live:
 *
 *   frame.contentWindow.postMessage({ type: 'skdoctool:theme', theme: 'dark' }, '*')
 *
 * Any origin is accepted, deliberately: we can't know the host's origin, and
 * the worst a hostile sender achieves is recolouring a frame the host already
 * controls the size and placement of. The payload is validated, never stored,
 * and can't reach anything but the palette.
 */
export function listenForHostTheme(): () => void {
  const onMessage = (event: MessageEvent) => {
    const data = event.data
    if (!data || typeof data !== 'object' || data.type !== EMBED_THEME_MESSAGE) return
    if (!isThemePreference(data.theme)) return
    setThemePreference(data.theme, { persist: false })
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}

export function useTheme() {
  const preferenceValue = useSyncExternalStore(subscribe, getThemePreference, () => 'system')
  const resolved = useSyncExternalStore(subscribe, getResolvedTheme, () => 'light' as const)
  const setPreference = useCallback((next: ThemePreference) => setThemePreference(next), [])
  return { preference: preferenceValue, resolved, setPreference }
}
