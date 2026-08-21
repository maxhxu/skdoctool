import { getRenderer } from './rendererRegistry'

export function MarkdownEditor({
  content,
  onChange,
  kind,
  readOnly = false,
}: {
  content: string
  onChange: (value: string) => void
  kind: string
  readOnly?: boolean
}) {
  const Renderer = getRenderer(kind)
  return (
    <div className="editor-split">
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
      />
      <div className="preview-pane">
        <Renderer content={content} />
      </div>
    </div>
  )
}
