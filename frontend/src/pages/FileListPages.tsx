import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { filesApi, type FileMeta } from '../lib/api'

function FileList({ files }: { files: FileMeta[] }) {
  if (files.length === 0) {
    return <div className="empty-state">No files here yet.</div>
  }
  return (
    <div className="file-list">
      {files.map((f) => (
        <Link key={f.id} to={`/files/${f.id}`} className="file-row">
          <div>
            <div className="file-row-title">{f.title}</div>
            <div className="muted" style={{ fontSize: '0.82rem' }}>
              {f.owner_username && <>by @{f.owner_username} · </>}
              <span className="mono">{f.kind}</span>
            </div>
          </div>
          <span className={`pill ${f.visibility === 'private' ? 'private' : ''}`}>{f.visibility}</span>
        </Link>
      ))}
    </div>
  )
}

export function MyFilesPage() {
  const [files, setFiles] = useState<FileMeta[] | null>(null)

  useEffect(() => {
    filesApi.mine().then((r) => setFiles(r.files))
  }, [])

  return (
    <div className="stack">
      <div className="row-between">
        <h1 className="page-title">My files</h1>
        <Link to="/files/new"><button className="primary">New file</button></Link>
      </div>
      {files ? <FileList files={files} /> : <p className="muted">Loading…</p>}
    </div>
  )
}
