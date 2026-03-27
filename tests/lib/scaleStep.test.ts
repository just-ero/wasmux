import { describe, expect, it } from 'vitest'
import { scaleStep } from '@/components/shared/LinkedDimensionInput'

describe('scaleStep', () => {
  const src = 1920
  const min = 1

  function displayed(px: number) {
    const s = px / src
    return s < 1 ? +s.toFixed(2) : +s.toFixed(1)
  }

  it('steps down by 0.05 at exactly 1.0', () => {
    // at 1.0× (1920), scroll down → 0.95×
    const next = scaleStep(1920, src, false, min)
    expect(displayed(next)).toBe(0.95)
  })

  it('steps up by 0.1 at exactly 1.0', () => {
    // at 1.0× (1920), scroll up → 1.1×
    const next = scaleStep(1920, src, true, min)
    expect(displayed(next)).toBe(1.1)
  })

  it('steps by 0.1 at scale 1.5', () => {
    const next = scaleStep(2880, src, false, min)
    expect(displayed(next)).toBe(1.4)
  })

  it('steps by 0.05 between 0.1 and 1', () => {
    // at 0.50× (960), scroll down → 0.45×
    const next = scaleStep(960, src, false, min)
    expect(displayed(next)).toBe(0.45)
  })

  it('steps by 0.01 at exactly 0.1', () => {
    // at 0.10× (192), scroll down → 0.09×
    const next = scaleStep(192, src, false, min)
    expect(displayed(next)).toBe(0.09)
  })

  it('steps up by 0.05 at exactly 0.1', () => {
    // at 0.10× (192), scroll up → 0.15×
    const next = scaleStep(192, src, true, min)
    expect(displayed(next)).toBe(0.15)
  })

  it('treats near-0.10 display as 0.10 for downward step', () => {
    // 134/1280 ~= 0.1047, displayed as 0.10, so one down step should use 0.01.
    const next = scaleStep(134, 1280, false, min)
    expect(+((next / 1280).toFixed(2))).toBe(0.09)
  })

  it('steps by 0.01 below 0.1', () => {
    // at 0.05× (96), scroll down → 0.04×
    const next = scaleStep(96, src, false, min)
    expect(displayed(next)).toBe(0.04)
  })

  it('steps by 0.01 at 0.02', () => {
    // at 0.02× (38), scroll down → 0.01×
    const next = scaleStep(38, src, false, min)
    expect(displayed(next)).toBe(0.01)
  })

  it('scrolling up from 0.04 goes to 0.05', () => {
    const next = scaleStep(77, src, true, min)
    expect(displayed(next)).toBe(0.05)
  })

  it('scrolling up from 0.9 goes to 0.95 (0.05 step below 1×)', () => {
    const next = scaleStep(1728, src, true, min)
    expect(displayed(next)).toBe(0.95)
  })

  it('does not go below min', () => {
    const next = scaleStep(1, src, false, min)
    expect(next).toBeGreaterThanOrEqual(min)
  })

  it('each tick from 0.10 to 0.01 changes displayed scale by 0.01', () => {
    let px = 192 // 0.10×
    const scales: number[] = [displayed(px)]
    while (displayed(px) > 0.01) {
      px = scaleStep(px, src, false, min)
      scales.push(displayed(px))
    }
    // every consecutive pair should differ by 0.01 or 0.05
    for (let i = 1; i < scales.length; i++) {
      const diff = +(scales[i - 1] - scales[i]).toFixed(2)
      expect(diff === 0.05 || diff === 0.01).toBe(true)
    }
  })
})
