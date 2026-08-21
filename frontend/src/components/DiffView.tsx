import type { DiffRow } from '../lib/api'

export function DiffView({ diff }: { diff: DiffRow[] }) {
  if (diff.length === 0) {
    return <p className="muted">No changes.</p>
  }
  return (
    <table className="diff-table">
      <tbody>
        {diff.map((row, i) => {
          const rowClass = row.type === 'add' ? 'diff-row-add' : row.type === 'remove' ? 'diff-row-remove' : ''
          const marker = row.type === 'add' ? '+' : row.type === 'remove' ? '-' : ' '
          return (
            <tr key={i} className={rowClass}>
              <td className="diff-line-no">{row.old_line ?? ''}</td>
              <td className="diff-line-no">{row.new_line ?? ''}</td>
              <td className="diff-marker">{marker}</td>
              <td className="diff-text">{row.text}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
