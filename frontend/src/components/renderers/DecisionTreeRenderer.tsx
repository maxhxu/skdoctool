import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { findStartNode, parseDecisionTree, parseDocument, type TreeNode } from '../../lib/skdown'

export function DecisionTreeRenderer({ content }: { content: string }) {
  const nodes = useMemo(() => parseDecisionTree(parseDocument(content)), [content])
  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const start = useMemo(() => findStartNode(nodes), [nodes])
  const [currentId, setCurrentId] = useState<string | undefined>(start?.id)
  const [visited, setVisited] = useState<string[]>(start ? [start.id] : [])

  if (nodes.length === 0) {
    return (
      <p className="muted">
        This decision tree has no nodes yet. Add one with a block like:{' '}
        <code>:::node id="start" title="Welcome" start="true"</code>
      </p>
    )
  }

  const current: TreeNode | undefined = (currentId ? nodesById.get(currentId) : undefined) ?? start

  function goTo(id: string) {
    if (!nodesById.has(id)) return
    setCurrentId(id)
    setVisited((v) => [...v, id])
  }

  return (
    <div className="tree-renderer stack">
      {visited.length > 1 && (
        <div className="muted mono" style={{ fontSize: '0.8rem' }}>
          {visited.join(' -> ')}
        </div>
      )}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{current?.title}</h3>
        <div className="tree-node-body md-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                if (href?.startsWith('#')) {
                  const targetId = href.slice(1)
                  const exists = nodesById.has(targetId)
                  return (
                    <button
                      type="button"
                      className="tree-choice-btn"
                      disabled={!exists}
                      onClick={() => goTo(targetId)}
                      title={exists ? undefined : `No node with id "${targetId}"`}
                    >
                      {children} →
                    </button>
                  )
                }
                return (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                )
              },
            }}
          >
            {current?.body ?? ''}
          </ReactMarkdown>
        </div>
      </div>
      {visited.length > 1 && (
        <button
          type="button"
          className="subtle"
          onClick={() => {
            setVisited([start!.id])
            setCurrentId(start!.id)
          }}
        >
          Start over
        </button>
      )}
    </div>
  )
}
