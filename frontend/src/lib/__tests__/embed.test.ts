import { describe, expect, it } from 'vitest'
import { isEmbedMode } from '../embed'

describe('isEmbedMode', () => {
  it('turns on when the page is framed, so the shared URL is also the embed URL', () => {
    expect(isEmbedMode('', true)).toBe(true)
    expect(isEmbedMode('', false)).toBe(false)
  })

  it('lets ?embed=1 preview the embed outside a frame', () => {
    expect(isEmbedMode('?embed=1', false)).toBe(true)
    expect(isEmbedMode('?embed', false)).toBe(true)
  })

  it('lets ?embed=0 opt back into the full app inside a frame', () => {
    expect(isEmbedMode('?embed=0', true)).toBe(false)
    expect(isEmbedMode('?embed=false', true)).toBe(false)
  })

  it('ignores unrelated query params', () => {
    expect(isEmbedMode('?ref=blog', true)).toBe(true)
    expect(isEmbedMode('?ref=blog', false)).toBe(false)
  })
})
