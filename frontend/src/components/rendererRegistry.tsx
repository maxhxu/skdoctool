import type { ComponentType } from 'react'
import { DocRenderer } from './renderers/DocRenderer'
import { DecisionTreeRenderer } from './renderers/DecisionTreeRenderer'
import { QuizRenderer } from './renderers/QuizRenderer'

export interface RendererProps {
  content: string
}

/**
 * Adding a new file kind is: write a component that takes { content } and
 * derives whatever it needs via `lib/skdown.ts`, then register it here.
 * Nothing about storage, diffing, sharing, or permissions changes — those
 * all operate on the same plain-text `content` regardless of kind.
 */
export const RENDERERS: Record<string, ComponentType<RendererProps>> = {
  doc: DocRenderer,
  'decision-tree': DecisionTreeRenderer,
  quiz: QuizRenderer,
}

export const FILE_KINDS = Object.keys(RENDERERS)

export function getRenderer(kind: string): ComponentType<RendererProps> {
  return RENDERERS[kind] ?? DocRenderer
}
