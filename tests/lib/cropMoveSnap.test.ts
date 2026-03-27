import { describe, expect, it } from 'vitest'
import { resolveMoveSnap } from '@/lib/cropMoveSnap'
import type { CropRegion } from '@/types/editor'

const baseCrop: CropRegion = { x: 40, y: 40, width: 20, height: 20 }

function run(input: Partial<Parameters<typeof resolveMoveSnap>[0]> = {}) {
  return resolveMoveSnap({
    orig: baseCrop,
    sourceW: 200,
    sourceH: 200,
    centerX: 100,
    centerY: 100,
    snapZoneX: 10,
    snapZoneY: 10,
    dx: 0,
    dy: 0,
    constrainAspect: false,
    quantizedDx: 0,
    quantizedDy: 0,
    prevLock: null,
    ...input,
  })
}

describe('resolveMoveSnap', () => {
  it('moves freely with no snap when outside snap zones', () => {
    const result = run({ dx: 10, dy: 7 })
    expect(result.x).toBe(50)
    expect(result.y).toBe(47)
    expect(result.snappedXGuide).toBe(false)
    expect(result.snappedYGuide).toBe(false)
    expect(result.nextLock).toBeNull()
  })

  it('snaps free movement by nearest edge/center target per axis', () => {
    // left edge reaches centerX, top edge reaches centerY
    const result = run({ dx: 60, dy: 60 })
    expect(result.x).toBe(100)
    expect(result.y).toBe(100)
    expect(result.snappedXGuide).toBe(true)
    expect(result.snappedYGuide).toBe(true)
  })

  it('does not snap diagonal shift movement (deliberately disabled)', () => {
    const result = run({
      dx: 60,
      dy: 60,
      constrainAspect: true,
      quantizedDx: 60,
      quantizedDy: 60,
    })

    expect(result.x).toBe(100)
    expect(result.y).toBe(100)
    expect(result.snappedXGuide).toBe(false)
    expect(result.snappedYGuide).toBe(false)
    expect(result.nextLock).toBeNull()
  })

  it('locks axis-aligned shift movement in snap region', () => {
    const result = run({
      dx: 60,
      dy: 0,
      constrainAspect: true,
      quantizedDx: 60,
      quantizedDy: 0,
    })

    expect(result.snappedXGuide).toBe(true)
    expect(result.snappedYGuide).toBe(false)
    expect(result.x).toBe(100)
    expect(result.nextLock).toEqual({ x: 100, y: 40 })
  })

  it('uses previous lock fallback while still in shift snap region', () => {
    const result = run({
      dx: 60,
      dy: 0,
      constrainAspect: true,
      quantizedDx: 60,
      quantizedDy: 0,
      prevLock: { x: 100, y: 40 },
    })

    expect(result.nextLock).toEqual({ x: 100, y: 40 })
    expect(result.x).toBe(100)
    expect(result.y).toBe(40)
  })

  it('clears lock when shift movement leaves snap region', () => {
    const result = run({
      dx: 5,
      dy: 0,
      constrainAspect: true,
      quantizedDx: 5,
      quantizedDy: 0,
      prevLock: { x: 100, y: 40 },
    })

    expect(result.nextLock).toBeNull()
    expect(result.snappedXGuide).toBe(false)
    expect(result.snappedYGuide).toBe(false)
  })
})
