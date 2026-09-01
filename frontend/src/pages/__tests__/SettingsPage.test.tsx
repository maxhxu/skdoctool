import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SettingsPage } from '../SettingsPage'
import { THEME_STORAGE_KEY, startTheme } from '../../lib/theme'

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
})

function boot() {
  cleanups.push(startTheme())
  render(<SettingsPage />)
  return screen.getByRole('switch', { name: 'Dark mode' }) as HTMLInputElement
}

describe('SettingsPage', () => {
  it('starts on whatever the system says, and says so', () => {
    mockSystemDark(true)
    expect(boot().checked).toBe(true)
    expect(screen.getByText(/Following your system setting/)).toBeTruthy()
  })

  it('flipping the toggle repaints the app and remembers the choice', () => {
    mockSystemDark(false)
    const toggle = boot()

    fireEvent.click(toggle)
    expect(toggle.checked).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    fireEvent.click(toggle)
    expect(toggle.checked).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('offers a way back to the system setting once you have overridden it', () => {
    mockSystemDark(true)
    const toggle = boot()
    expect(screen.queryByRole('button', { name: /Match my system/ })).toBe(null)

    fireEvent.click(toggle) // explicit light, against a dark system
    fireEvent.click(screen.getByRole('button', { name: /Match my system/ }))

    expect(toggle.checked).toBe(true)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
  })
})
