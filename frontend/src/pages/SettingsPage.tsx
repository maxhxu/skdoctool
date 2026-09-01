import { useTheme } from '../lib/theme'

/**
 * Preferences that live in the browser, not the account — so this page works
 * logged out, and there's no API call behind the toggle.
 */
export function SettingsPage() {
  const { preference, resolved, setPreference } = useTheme()

  return (
    <div className="stack settings-page">
      <h1 className="page-title">Settings</h1>

      <div className="card">
        <div className="setting-row">
          <div>
            <div className="setting-label">Dark mode</div>
            <p className="setting-help">
              {preference === 'system'
                ? `Following your system setting, which is currently ${resolved}.`
                : 'Set here, on this browser. It applies whether or not you’re logged in.'}
              {preference !== 'system' && (
                <>
                  {' '}
                  <button className="setting-reset" onClick={() => setPreference('system')}>
                    Match my system instead
                  </button>
                </>
              )}
            </p>
            <p className="setting-help">
              A file embedded on another site follows the reader’s own system setting, since
              it can’t see this one. Hosts that want to pin a palette can add{' '}
              <code>?theme=dark</code> to the iframe URL.
            </p>
          </div>
          <Switch
            label="Dark mode"
            checked={resolved === 'dark'}
            onChange={(checked) => setPreference(checked ? 'dark' : 'light')}
          />
        </div>
      </div>
    </div>
  )
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
    </label>
  )
}
