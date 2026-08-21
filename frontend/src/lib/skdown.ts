// skdown: the small, generic parser every renderer builds on.
//
// A file's content is always plain markdown. On top of that, two bits of
// optional structure let renderers find meaning without inventing a new
// syntax for prose:
//
//   1. YAML-lite frontmatter: `---\nkind: quiz\n---` at the very top,
//      just `key: value` lines (no nesting/lists — deliberately minimal
//      so we don't need a YAML dependency for one field).
//   2. Directive blocks: `:::type key="val" ...` ... `:::`, each holding
//      ordinary markdown as its body.
//
// This module only extracts structure. Turning that structure into UI is
// each renderer's job (see components/renderers/*).

export interface Frontmatter {
  [key: string]: string
}

export interface Block {
  type: string
  attrs: Record<string, string>
  body: string
  startLine: number
  endLine: number
}

export interface ParsedDocument {
  frontmatter: Frontmatter
  /** Markdown that appears before/between/after directive blocks. */
  intro: string
  blocks: Block[]
}

const FENCE_OPEN_RE = /^:::(\S+)(.*)$/
const FENCE_CLOSE_RE = /^:::\s*$/
// key="value" or key='value', simple and deliberately not a full attribute
// grammar — good enough for id/title/start-style flags.
const ATTR_RE = /(\w+)=("([^"]*)"|'([^']*)')/g

function parseAttrs(rest: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  let match: RegExpExecArray | null
  ATTR_RE.lastIndex = 0
  while ((match = ATTR_RE.exec(rest))) {
    attrs[match[1]] = match[3] !== undefined ? match[3] : match[4]
  }
  return attrs
}

export function parseFrontmatter(text: string): { frontmatter: Frontmatter; rest: string } {
  const lines = text.split('\n')
  if (lines[0]?.trim() !== '---') {
    return { frontmatter: {}, rest: text }
  }
  const frontmatter: Frontmatter = {}
  let i = 1
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '---') {
      i++
      break
    }
    const colon = line.indexOf(':')
    if (colon > 0) {
      const key = line.slice(0, colon).trim()
      const value = line.slice(colon + 1).trim()
      frontmatter[key] = value
    }
  }
  return { frontmatter, rest: lines.slice(i).join('\n') }
}

export function parseBlocks(text: string): { intro: string; blocks: Block[] } {
  const lines = text.split('\n')
  const blocks: Block[] = []
  const introLines: string[] = []
  let i = 0

  while (i < lines.length) {
    const openMatch = FENCE_OPEN_RE.exec(lines[i])
    if (!openMatch) {
      introLines.push(lines[i])
      i++
      continue
    }
    const type = openMatch[1]
    const attrs = parseAttrs(openMatch[2] ?? '')
    const startLine = i
    const bodyLines: string[] = []
    i++
    while (i < lines.length && !FENCE_CLOSE_RE.test(lines[i])) {
      bodyLines.push(lines[i])
      i++
    }
    const endLine = i
    i++ // skip the closing ':::'
    blocks.push({ type, attrs, body: bodyLines.join('\n').trim(), startLine, endLine })
  }

  return { intro: introLines.join('\n').trim(), blocks }
}

export function parseDocument(text: string): ParsedDocument {
  const { frontmatter, rest } = parseFrontmatter(text)
  const { intro, blocks } = parseBlocks(rest)
  return { frontmatter, intro, blocks }
}

export function documentKind(doc: ParsedDocument): string {
  return doc.frontmatter.kind || 'doc'
}

// ---- decision-tree helpers -------------------------------------------

export interface TreeNode {
  id: string
  title: string
  start: boolean
  body: string
}

export function parseDecisionTree(doc: ParsedDocument): TreeNode[] {
  return doc.blocks
    .filter((b) => b.type === 'node')
    .map((b) => ({
      id: b.attrs.id ?? '',
      title: b.attrs.title ?? b.attrs.id ?? 'Untitled',
      start: b.attrs.start === 'true',
      body: b.body,
    }))
    .filter((n) => n.id.length > 0)
}

export function findStartNode(nodes: TreeNode[]): TreeNode | undefined {
  return nodes.find((n) => n.start) ?? nodes[0]
}

// ---- quiz helpers -------------------------------------------------------

export interface QuizOption {
  text: string
  correct: boolean
}

export interface QuizQuestion {
  id: string
  title: string
  options: QuizOption[]
}

const TASK_ITEM_RE = /^\s*-\s*\[( |x|X)\]\s*(.+)$/

export function parseQuiz(doc: ParsedDocument): QuizQuestion[] {
  return doc.blocks
    .filter((b) => b.type === 'question')
    .map((b, index) => {
      const options: QuizOption[] = []
      for (const line of b.body.split('\n')) {
        const m = TASK_ITEM_RE.exec(line)
        if (m) {
          options.push({ text: m[2].trim(), correct: m[1].toLowerCase() === 'x' })
        }
      }
      return {
        id: b.attrs.id ?? `q${index}`,
        title: b.attrs.title ?? `Question ${index + 1}`,
        options,
      }
    })
}
