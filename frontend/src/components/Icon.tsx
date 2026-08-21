export type IconName =
  | 'home'
  | 'compass'
  | 'folder'
  | 'plus'
  | 'user'
  | 'key'
  | 'chevron-down'
  | 'log-in'
  | 'log-out'
  | 'shield'
  | 'layers'
  | 'history'
  | 'check-circle'

function paths(name: IconName) {
  switch (name) {
    case 'home':
      return <path d="M3.5 10.5 10 4.5l6.5 6M5.5 9v6.5a1 1 0 0 0 1 1h2.5v-4h2v4H13.5a1 1 0 0 0 1-1V9" />
    case 'compass':
      return (
        <>
          <circle cx="10" cy="10" r="6.75" />
          <path d="m12.4 7.6-1.3 3.5-3.5 1.3 1.3-3.5z" strokeLinejoin="round" />
        </>
      )
    case 'folder':
      return <path d="M3 6.25A1.25 1.25 0 0 1 4.25 5h3.5l1.5 1.75h6.5A1.25 1.25 0 0 1 17 8v6.75A1.25 1.25 0 0 1 15.75 16H4.25A1.25 1.25 0 0 1 3 14.75z" />
    case 'plus':
      return (
        <>
          <path d="M7 3.25h4l3.75 3.75v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.25a1 1 0 0 1 1-1z" />
          <path d="M11 3.25V7h3.75" />
          <path d="M10 9.75v4M8 11.75h4" />
        </>
      )
    case 'user':
      return (
        <>
          <circle cx="10" cy="7" r="3" />
          <path d="M3.75 16.5c.6-3.2 3-5 6.25-5s5.65 1.8 6.25 5" />
        </>
      )
    case 'key':
      return (
        <>
          <circle cx="6" cy="10.5" r="2.75" />
          <path d="M8.6 10.5H16m-2.5 0v2.25M16 10.5v3" />
        </>
      )
    case 'chevron-down':
      return <path d="m5.5 8 4.5 4.5L14.5 8" />
    case 'log-in':
      return (
        <>
          <path d="M8.5 3.75H5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h3.5" />
          <path d="M12.5 14 16.5 10l-4-4M16.5 10h-9" />
        </>
      )
    case 'log-out':
      return (
        <>
          <path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
          <path d="M12.5 14 16.5 10l-4-4M16.5 10H8" />
        </>
      )
    case 'shield':
      return (
        <>
          <path d="M10 3.2 15.5 5.4v4.1c0 3.6-2.3 6.1-5.5 7.3-3.2-1.2-5.5-3.7-5.5-7.3V5.4z" />
          <path d="m7.6 10 1.7 1.7 3-3.4" />
        </>
      )
    case 'layers':
      return (
        <>
          <path d="m10 3.5 6.25 3.2L10 9.9 3.75 6.7z" />
          <path d="m4.5 9.5 5.5 2.85 5.5-2.85" />
          <path d="m4.5 12.5 5.5 2.85 5.5-2.85" />
        </>
      )
    case 'history':
      return (
        <>
          <path d="M3.5 10a6.5 6.5 0 1 0 2.2-4.9L3.5 7" />
          <path d="M3.5 3.5v3.5h3.5" />
          <path d="M10 7v3.2l2.3 1.4" />
        </>
      )
    case 'check-circle':
      return (
        <>
          <circle cx="10" cy="10" r="6.5" />
          <path d="m7.2 10.1 1.9 1.9 3.7-4.2" />
        </>
      )
  }
}

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths(name)}
    </svg>
  )
}
