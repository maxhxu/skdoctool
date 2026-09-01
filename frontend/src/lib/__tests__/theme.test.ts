import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMBED_THEME_MESSAGE,
  THEME_STORAGE_KEY,
  getResolvedTheme,
  getThemePreference,
  listenForHostTheme,
  parseThemeParam,
  readStoredTheme,
  resolveTheme,
  setThemePreference,
  startTheme,
} from '../theme'

/** jsdom has no real media engine — matchMedia always reports `matches: false`. */
function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: dark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

const cleanups: Array<() => void> = []

afterEach(() => {
  cleanups.splice(0).forEach((stop) => stop())
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})

function boot(url = '/') {
  window.history.replaceState(null, '', url)
  cleanups.push(startTheme())
}

describe('resolveTheme', () => {
  it('follows the system only when the preference is "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})

describe('parseThemeParam', () => {
  it('reads the palette a host pins on the iframe URL', () => {
    expect(parseThemeParam('?theme=dark')).toBe('dark')
    expect(parseThemeParam('?embed=1&theme=light')).toBe('light')
    expect(parseThemeParam('?theme=system')).toBe('system')
  })

  it('ignores anything it does not recognise', () => {
    expect(parseThemeParam('')).toBe(null)
    expect(parseThemeParam('?theme=')).toBe(null)
    expect(parseThemeParam('?theme=neon')).toBe(null)
    expect(parseThemeParam('?embed=1')).toBe(null)
  })
})

describe('readStoredTheme', () => {
  it('defaults to "system", including when storage holds junk', () => {
    expect(readStoredTheme()).toBe('system')
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon')
    expect(readStoredTheme()).toBe('system')
  })

  it('survives storage throwing, as it does in a blocked third-party frame', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked')
    })
    expect(readStoredTheme()).toBe('system')
  })
})

describe('startTheme', () => {
  it('stamps the resolved theme on <html> for the CSS to pick up', () => {
    mockSystemDark(true)
    boot()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(getThemePreference()).toBe('system')
  })

  it('prefers the stored toggle over the system setting', () => {
    mockSystemDark(true)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    boot()
    expect(getResolvedTheme()).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('lets ?theme= win, so an embed can be themed by the page framing it', () => {
    mockSystemDark(false)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    boot('/files/1?embed=1&theme=dark')
    expect(getResolvedTheme()).toBe('dark')
  })

  it('reads the system setting when a framed page cannot reach storage', () => {
    mockSystemDark(true)
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked')
    })
    boot('/files/1')
    expect(getResolvedTheme()).toBe('dark')
  })
})

describe('setThemePreference', () => {
  it('persists the toggle so the next visit opens in the same palette', () => {
    mockSystemDark(false)
    boot()
    setThemePreference('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('does not persist when the choice came from outside the app', () => {
    mockSystemDark(false)
    boot()
    setThemePreference('dark', { persist: false })
    expect(getResolvedTheme()).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(null)
  })
})

describe('listenForHostTheme', () => {
  function postFromHost(data: unknown) {
    window.dispatchEvent(new MessageEvent('message', { data }))
  }

  it('re-themes a framed file when the host asks, without storing its choice', () => {
    mockSystemDark(false)
    boot('/files/1')
    cleanups.push(listenForHostTheme())

    postFromHost({ type: EMBED_THEME_MESSAGE, theme: 'dark' })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(null)
  })

  it('ignores messages that are not a valid theme', () => {
    mockSystemDark(false)
    boot('/files/1')
    cleanups.push(listenForHostTheme())

    postFromHost({ type: EMBED_THEME_MESSAGE, theme: 'neon' })
    postFromHost({ type: 'something-else', theme: 'dark' })
    postFromHost('dark')
    postFromHost(null)
    expect(getResolvedTheme()).toBe('light')
  })

  it('stops listening once the embed unmounts', () => {
    mockSystemDark(false)
    boot('/files/1')
    listenForHostTheme()()

    postFromHost({ type: EMBED_THEME_MESSAGE, theme: 'dark' })
    expect(getResolvedTheme()).toBe('light')
  })
})
