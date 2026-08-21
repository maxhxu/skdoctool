import { describe, expect, it } from 'vitest'
import {
  documentKind,
  findStartNode,
  parseDecisionTree,
  parseDocument,
  parseFrontmatter,
  parseQuiz,
} from '../skdown'

describe('parseFrontmatter', () => {
  it('extracts kind and strips the frontmatter block', () => {
    const { frontmatter, rest } = parseFrontmatter('---\nkind: quiz\n---\n\nHello')
    expect(frontmatter.kind).toBe('quiz')
    expect(rest.trim()).toBe('Hello')
  })

  it('is a no-op when there is no frontmatter', () => {
    const { frontmatter, rest } = parseFrontmatter('# Just a doc\n')
    expect(frontmatter).toEqual({})
    expect(rest).toBe('# Just a doc\n')
  })
})

describe('parseDocument / documentKind', () => {
  it('defaults to "doc" when kind is missing or unrecognized', () => {
    expect(documentKind(parseDocument('hello'))).toBe('doc')
    expect(documentKind(parseDocument('---\nkind: something-weird\n---\nhi'))).toBe('something-weird')
  })

  it('keeps intro markdown outside of directive blocks', () => {
    const doc = parseDocument('Intro para.\n\n:::node id="a"\nbody\n:::\n\nOutro para.')
    expect(doc.intro).toContain('Intro para.')
    expect(doc.intro).toContain('Outro para.')
    expect(doc.blocks).toHaveLength(1)
  })
})

describe('decision tree parsing', () => {
  const source = `---
kind: decision-tree
---

:::node id="start" title="Welcome" start="true"
You wake up.

- [Go left](#left)
- [Go right](#right)
:::

:::node id="left" title="Left room"
It's a closet.
:::

:::node id="right" title="Right room"
Freedom.
:::
`

  it('parses every node with its attrs and body', () => {
    const doc = parseDocument(source)
    const nodes = parseDecisionTree(doc)
    expect(nodes.map((n) => n.id)).toEqual(['start', 'left', 'right'])
    expect(nodes[0].title).toBe('Welcome')
    expect(nodes[0].body).toContain('Go left')
  })

  it('finds the node explicitly marked start', () => {
    const doc = parseDocument(source)
    const nodes = parseDecisionTree(doc)
    expect(findStartNode(nodes)?.id).toBe('start')
  })

  it('falls back to the first node when nothing is marked start', () => {
    const nodes = parseDecisionTree(
      parseDocument(':::node id="only"\nhi\n:::')
    )
    expect(findStartNode(nodes)?.id).toBe('only')
  })

  it('ignores node blocks with no id', () => {
    const nodes = parseDecisionTree(parseDocument(':::node title="oops"\nhi\n:::'))
    expect(nodes).toHaveLength(0)
  })
})

describe('quiz parsing', () => {
  const source = `:::question title="2 + 2?"
- [ ] 3
- [x] 4
- [ ] 5
:::

:::question title="Capital of France?"
- [ ] London
- [x] Paris
:::
`

  it('parses each question and marks the checked option correct', () => {
    const questions = parseQuiz(parseDocument(source))
    expect(questions).toHaveLength(2)
    expect(questions[0].title).toBe('2 + 2?')
    expect(questions[0].options).toHaveLength(3)
    expect(questions[0].options.find((o) => o.correct)?.text).toBe('4')
    expect(questions[1].options.find((o) => o.correct)?.text).toBe('Paris')
  })

  it('is order/case-insensitive on the checkbox marker', () => {
    const questions = parseQuiz(parseDocument(':::question\n- [X] Yes\n- [ ] No\n:::'))
    expect(questions[0].options[0].correct).toBe(true)
  })
})

describe('round trip / editing safety', () => {
  it('a raw markdown edit outside any block still parses (falls back gracefully)', () => {
    // The point of the format: even a half-finished edit (missing a
    // closing fence) should not throw — worst case it swallows the rest
    // into one block's body, which is exactly what git-style plain-text
    // diffing expects to be able to show a user.
    expect(() => parseDocument(':::node id="a"\nunterminated')).not.toThrow()
  })
})
