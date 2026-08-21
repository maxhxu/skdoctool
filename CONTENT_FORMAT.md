# File content format ("skdown")

Every file's content is **plain text, always valid on its own as
markdown**. This is deliberate: it's what makes diffing work well — a
diff is just a normal line-based text diff, readable with no special
tooling, regardless of which renderer a file uses.

## Shape

```
---
kind: decision-tree
---

Optional intro markdown (rendered above everything else).

:::node id="start" title="Welcome" start="true"
You wake up in a dim room. Two doors ahead.

- [Try the left door](#left)
- [Try the right door](#right)
:::

:::node id="left" title="The left door"
It's a closet. Dead end.
:::

:::node id="right" title="The right door"
Stairs down. You made it out.
:::
```

- **Frontmatter** (optional): `---\nkind: <doc|decision-tree|quiz>\n---`.
  No `kind`, or an unrecognized one, just renders as plain markdown
  ("doc" is the default/fallback renderer every other kind degrades to).
- **Directive blocks**: `:::type key="val" ...` ... `:::`, each containing
  ordinary markdown. Everything outside a block is plain markdown too.
  Blocks are how a renderer finds *structure* without inventing a new
  syntax for prose — the body of a block is just markdown, so it edits,
  previews, and diffs exactly like the rest of the document.

## Renderers

- **doc** (default): render the whole thing as markdown. Always
  available, and what any unrecognized `kind` (or content with directive
  syntax errors) falls back to — a file is never unviewable.
- **decision-tree**: each `:::node` is a page. Internal links whose href
  is `#<node-id>` become "go to this node" buttons instead of anchor
  jumps. The node with `start="true"` (or the first node) is the entry
  point.
- **quiz**: each `:::question` is one question. Its body is a normal GFM
  task list (`- [ ]` / `- [x]`) — the checked item is the correct answer.
  No separate "answer key" field to keep in sync with the options.

Both non-default renderers are just *views* over the same node/question
list — the frontend's directive-block parser is a small, generic tree
walker (`frontend/src/lib/skdown.ts`); adding a third kind means adding a
new React component that consumes the same parsed blocks, not touching
storage, diffing, or the API.

## Contributions (suggestions)

Anyone who can *view* a file can propose a change: they submit full new
content, the server stores it as a `suggestion` against the revision it
was based on, and the owner/editors see a diff (base revision -> proposed
content) to accept or reject. Accepting creates a normal new revision, so
history stays a straight line of revisions with suggestions as the
"how did this one get proposed" side-channel — same model as a PR, minus
branches.
