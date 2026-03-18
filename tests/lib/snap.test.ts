import { describe, it, expect } from 'vitest'
import { snap } from '@/lib/snap'

describe('snap', () => {
  it('snaps when value is within zone', () => {
    expect(snap(102, 100, 5)).toBe(100)
  })

  it('returns value when outside zone', () => {
    expect(snap(110, 100, 5)).toBe(110)
  })

  it('does not snap at exact zone boundary (< not <=)', () => {
    expect(snap(105, 100, 5)).toBe(105)
  })

  it('snaps from below the target', () => {
    expect(snap(98, 100, 5)).toBe(100)
  })

  it('handles zero zone', () => {
    expect(snap(100, 100, 0)).toBe(100)
    expect(snap(101, 100, 0)).toBe(101)
  })

  it('handles negative values', () => {
    expect(snap(-3, 0, 5)).toBe(0)
  })
})
