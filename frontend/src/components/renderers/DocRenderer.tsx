import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** The fallback every other renderer degrades to: a file is never
 * unviewable, even with an unrecognized `kind` or a mid-edit parse hiccup. */
export function DocRenderer({ content }: { content: string }) {
  return (
    <div className="doc-renderer md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
