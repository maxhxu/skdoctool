import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError, filesApi, type FileDetail } from '../lib/api'
import { getRenderer } from '../components/rendererRegistry'
import { useEmbedHeightReporter, useOpenLinksInNewTab } from '../lib/embed'

/**
 * The view a file gets when it's framed on somebody else's site: the content,
 * and a badge back to the real thing. No nav, no tabs, no edit controls — see
 * lib/embed.ts for why that holds even when the frame is authenticated.
 */
export function EmbedPage() {
  const { id } = useParams<{ id: string }>()
  const fileId = Number(id)
  const [detail, setDetail] = useState<FileDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useOpenLinksInNewTab()
  useEmbedHeightReporter(rootRef)

  useEffect(() => {
    let cancelled = false
    filesApi
      .get(fileId)
      .then((d) => !cancelled && setDetail(d))
      .catch((err) => {
        if (cancelled) return
        // A private file is a 404 to an anonymous frame, same as a missing one —
        // the embed shouldn't confirm which, so neither does the wording.
        setError(
          err instanceof ApiError && err.status === 404
            ? "This file isn't public."
            : 'Failed to load this file.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [fileId])

  const href = `/files/${fileId}`

  if (error) {
    return (
      <div className="embed-root" ref={rootRef}>
        <p className="embed-message">{error}</p>
        <EmbedBadge href="/" />
      </div>
    )
  }
  if (!detail) {
    return (
      <div className="embed-root" ref={rootRef}>
        <p className="embed-message">Loading…</p>
      </div>
    )
  }

  const Renderer = getRenderer(detail.file.kind)

  return (
    <div className="embed-root" ref={rootRef}>
      <article className="embed-content">
        <h1 className="embed-title">
          <a href={href}>{detail.file.title}</a>
        </h1>
        <Renderer content={detail.content} />
      </article>
      <EmbedBadge href={href} />
    </div>
  )
}

function EmbedBadge({ href }: { href: string }) {
  return (
    <a className="embed-badge" href={href} title="View on skdoctool">
      <span className="brand-mark">sk</span>doctool
    </a>
  )
}
