// Embed mode: what a file looks like when someone drops
//
//   <iframe src="https://skdoctool.example/files/3"></iframe>
//
// onto their own site. There's deliberately no separate "embed URL" to keep
// in sync with the shareable one — the app notices it's being framed and
// renders the content-only view instead of the full workspace.
//
// Nothing here is a permission check. The session cookie is SameSite=Lax, so
// a cross-site frame is an anonymous request and the API only ever hands back
// files whose visibility is `public` (app/main.py `_can_view`). Embed mode
// also renders view-only always, since a *same-site* frame does send the
// cookie and would otherwise put edit controls on somebody else's page.

import { useEffect, type RefObject } from 'react'

/** postMessage payload hosts can listen for to size the iframe to its content. */
export const EMBED_HEIGHT_MESSAGE = 'skdoctool:height'

function isFramed(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // Reaching across to window.top can throw inside a sandboxed frame —
    // if we can't even look, we're certainly inside something.
    return true
  }
}

/**
 * `?embed=1` forces embed mode on, so an author can preview the embed without
 * building a test page. `?embed=0` forces it off — a dev escape hatch only:
 * nginx denies framing on that exact combination in production, since the full
 * app inside a frame is the clickjacking case the deny rule exists for.
 * Otherwise: framed means embedded.
 */
export function isEmbedMode(
  search: string = window.location.search,
  framed: boolean = isFramed(),
): boolean {
  const param = new URLSearchParams(search).get('embed')
  if (param !== null) return param !== '0' && param !== 'false'
  return framed
}

/**
 * Report the rendered height to the host page on every resize. An iframe can't
 * size itself, so hosts that care listen for this and set the height; hosts
 * that don't just get the iframe's own scrollbar.
 */
export function useEmbedHeightReporter(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el || window.parent === window.self) return

    const post = (height: number) => {
      // '*': a content height isn't a secret, and we can't know the host origin.
      window.parent.postMessage({ type: EMBED_HEIGHT_MESSAGE, height }, '*')
    }

    const observer = new ResizeObserver(([entry]) => post(entry.target.scrollHeight))
    observer.observe(el)
    post(el.scrollHeight)
    return () => observer.disconnect()
  }, [ref])
}

/**
 * Inside a frame, a plain link would navigate the frame itself — leaving the
 * host page displaying a stranded chunk of our app. A document-level <base>
 * retargets every link the renderers produce, whichever renderer that is.
 */
export function useOpenLinksInNewTab() {
  useEffect(() => {
    const base = document.createElement('base')
    base.target = '_blank'
    document.head.appendChild(base)
    return () => base.remove()
  }, [])
}
