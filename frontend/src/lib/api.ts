// Every mutating request needs an X-CSRF-Token header whose value is
// whatever the server put in the matching non-httponly cookie (see
// app/csrf.py on the backend — this file is the "echo it back" half).
// Register/login are the exception: there's no session cookie yet for a
// token to be bound to, so the backend doesn't require one for those.

const SESSION_CSRF_COOKIE = 'sshauth_csrf'
const CSRF_HEADER = 'X-CSRF-Token'

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: { csrf?: 'session' | 'none' } = {}
): Promise<T> {
  const headers: Record<string, string> = {}
  const csrfMode = opts.csrf ?? (method === 'GET' ? 'none' : 'session')
  if (csrfMode !== 'none') {
    const token = readCookie(SESSION_CSRF_COOKIE)
    if (token) headers[CSRF_HEADER] = token
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let message = res.statusText
    try {
      const data = await res.json()
      message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail ?? data)
    } catch {
      // non-JSON error body, keep statusText
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: unknown, opts?: { csrf?: 'session' | 'none' }) =>
    request<T>('POST', path, body, opts),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T,>(path: string) => request<T>('DELETE', path),
}

// ---- domain types ---------------------------------------------------------

export interface User {
  id: number
  username: string
}

export interface FileMeta {
  id: number
  owner_id: number
  owner_username: string | null
  title: string
  kind: string
  visibility: 'public' | 'private'
  head_revision_id: number
  created_at: number
  updated_at: number
}

export interface FileDetail {
  file: FileMeta
  content: string
  can_edit: boolean
  is_owner: boolean
}

export interface Revision {
  id: number
  parent_id: number | null
  message: string
  created_at: number
  author_username: string
}

export interface DiffRow {
  type: 'context' | 'add' | 'remove'
  text: string
  old_line: number | null
  new_line: number | null
}

export interface Suggestion {
  id: number
  file_id: number
  base_revision_id: number
  author_id: number
  author_username?: string
  content: string
  message: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: number
}

export interface Collaborator {
  user_id: number
  username: string
  added_at: number
}

export interface SocialLink {
  label: string
  url: string
}

export interface ProfileResponse {
  user: User
  bio_markdown: string
  social_links: SocialLink[]
  public_files: FileMeta[]
}

// ---- auth ---------------------------------------------------------------

export const authApi = {
  me: () => api.get<{ user: User | null }>('/api/me'),
  register: (username: string, password: string) =>
    api.post<{ user: User }>('/api/register', { username, password }, { csrf: 'none' }),
  login: (username: string, password: string) =>
    api.post<{ user: User }>('/api/login', { username, password }, { csrf: 'none' }),
  logout: () => api.post<{ ok: boolean }>('/api/logout'),
}

// ---- profiles -------------------------------------------------------------

export const profileApi = {
  get: (username: string) => api.get<ProfileResponse>(`/api/users/${encodeURIComponent(username)}`),
  updateBio: (bio_markdown: string) => api.put<{ ok: boolean }>('/api/profile', { bio_markdown }),
  updateLinks: (links: SocialLink[]) => api.put<{ ok: boolean }>('/api/profile/links', { links }),
}

// ---- files ----------------------------------------------------------------

export const filesApi = {
  mine: () => api.get<{ files: FileMeta[] }>('/api/files'),
  public: () => api.get<{ files: FileMeta[] }>('/api/files/public'),
  create: (input: { title: string; kind: string; visibility: string; content: string }) =>
    api.post<FileMeta>('/api/files', input),
  get: (id: number) => api.get<FileDetail>(`/api/files/${id}`),
  updateMeta: (id: number, input: { title: string; kind: string; visibility: string }) =>
    api.put<FileMeta>(`/api/files/${id}`, input),
  revisions: (id: number) => api.get<{ revisions: Revision[] }>(`/api/files/${id}/revisions`),
  createRevision: (id: number, input: { content: string; message: string; parent_revision_id: number }) =>
    api.post<Revision>(`/api/files/${id}/revisions`, input),
  diff: (id: number, from: number, to: number) =>
    api.get<{ diff: DiffRow[] }>(`/api/files/${id}/diff?from_revision=${from}&to_revision=${to}`),
  collaborators: (id: number) => api.get<{ collaborators: Collaborator[] }>(`/api/files/${id}/collaborators`),
  addCollaborator: (id: number, username: string) =>
    api.post<{ collaborators: Collaborator[] }>(`/api/files/${id}/collaborators`, { username }),
  removeCollaborator: (id: number, userId: number) =>
    api.del<{ ok: boolean }>(`/api/files/${id}/collaborators/${userId}`),
  suggestions: (id: number) => api.get<{ suggestions: Suggestion[] }>(`/api/files/${id}/suggestions`),
  createSuggestion: (id: number, input: { content: string; message: string; base_revision_id: number }) =>
    api.post<Suggestion>(`/api/files/${id}/suggestions`, input),
  suggestionDiff: (fileId: number, suggestionId: number) =>
    api.get<{ diff: DiffRow[] }>(`/api/files/${fileId}/suggestions/${suggestionId}/diff`),
  acceptSuggestion: (fileId: number, suggestionId: number) =>
    api.post<Revision>(`/api/files/${fileId}/suggestions/${suggestionId}/accept`),
  rejectSuggestion: (fileId: number, suggestionId: number) =>
    api.post<{ ok: boolean }>(`/api/files/${fileId}/suggestions/${suggestionId}/reject`),
}
