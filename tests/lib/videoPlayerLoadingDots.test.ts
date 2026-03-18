import { describe, expect, it } from 'vitest'
import { getLoadingDotsFrameText } from '@/components/editor/VideoPlayer'

describe('getLoadingDotsFrameText', () => {
  it('cycles through non-empty-space, one, two, and three dots', () => {
    expect(getLoadingDotsFrameText(0)).toBe('\u00A0')
    expect(getLoadingDotsFrameText(1)).toBe('.')
    expect(getLoadingDotsFrameText(2)).toBe('..')
    expect(getLoadingDotsFrameText(3)).toBe('...')
    expect(getLoadingDotsFrameText(4)).toBe('\u00A0')
  })

  it('wraps negative frame values safely', () => {
    expect(getLoadingDotsFrameText(-1)).toBe('...')
    expect(getLoadingDotsFrameText(-2)).toBe('..')
  })
})
