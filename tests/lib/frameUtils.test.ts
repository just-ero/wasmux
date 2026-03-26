import { describe, it, expect } from 'vitest'
import {
  frameToTime,
  timeToFrame,
  clampFrame,
  formatFrame,
  formatTime,
  formatFrameCompact,
  formatFramePadded,
} from '@/lib/frameUtils'

/* frametotime */
describe('frameToTime', () => {
  it('converts frame 0 to 0 seconds', () => {
    expect(frameToTime(0, 30)).toBe(0)
  })

  it('converts frame 30 at 30fps to 1 second', () => {
    expect(frameToTime(30, 30)).toBeCloseTo(1)
  })

  it('converts frame 150 at 25fps to 6 seconds', () => {
    expect(frameToTime(150, 25)).toBeCloseTo(6)
  })

  it('returns 0 when fps is 0', () => {
    expect(frameToTime(100, 0)).toBe(0)
  })

  it('returns 0 when fps is negative', () => {
    expect(frameToTime(100, -30)).toBe(0)
  })
})

/* timetoframe */
describe('timeToFrame', () => {
  it('converts 0 seconds to frame 0', () => {
    expect(timeToFrame(0, 30)).toBe(0)
  })

  it('converts 1 second at 30fps to frame 30', () => {
    expect(timeToFrame(1, 30)).toBe(30)
  })

  it('converts 2.5 seconds at 24fps to frame 60', () => {
    expect(timeToFrame(2.5, 24)).toBe(60)
  })

  it('rounds to nearest frame', () => {
    // 1.5 / 30 = 0.05s → frame 1.5 → round to 2
    expect(timeToFrame(0.05, 30)).toBe(2)
  })

  it('returns 0 when fps is 0', () => {
    expect(timeToFrame(5, 0)).toBe(0)
  })

  it('returns 0 when fps is negative', () => {
    expect(timeToFrame(5, -24)).toBe(0)
  })
})

/* clampframe */
describe('clampFrame', () => {
  it('clamps negative frame to 0', () => {
    expect(clampFrame(-5, 100)).toBe(0)
  })

  it('clamps frame beyond total to last frame', () => {
    expect(clampFrame(200, 100)).toBe(99)
  })

  it('passes through a valid frame', () => {
    expect(clampFrame(50, 100)).toBe(50)
  })

  it('returns 0 when totalFrames is 0', () => {
    expect(clampFrame(10, 0)).toBe(0)
  })

  it('returns 0 when totalFrames is negative', () => {
    expect(clampFrame(10, -5)).toBe(0)
  })

  it('allows frame 0 with totalFrames 1', () => {
    expect(clampFrame(0, 1)).toBe(0)
  })
})

/* formatframe */
describe('formatFrame', () => {
  it('formats frame 0 as 00:00:00:00', () => {
    expect(formatFrame(0, 30)).toBe('00:00:00:00')
  })

  it('formats a mid-range frame correctly', () => {
    // 90 frames at 30fps = 3 seconds, frame offset 0
    expect(formatFrame(90, 30)).toBe('00:00:03:00')
  })

  it('formats frame with sub-second offset', () => {
    // 95 frames at 30fps = 3.166s → 3s + frame 5
    expect(formatFrame(95, 30)).toBe('00:00:03:05')
  })

  it('formats hour-scale frames', () => {
    // 30fps * 3600 = 108000 frames = 1 hour
    expect(formatFrame(108000, 30)).toBe('01:00:00:00')
  })

  it('returns 00:00:00:00 when fps is 0', () => {
    expect(formatFrame(100, 0)).toBe('00:00:00:00')
  })

  it('returns 00:00:00:00 when fps is negative', () => {
    expect(formatFrame(100, -30)).toBe('00:00:00:00')
  })
})

/* formattime */
describe('formatTime', () => {
  it('formats short duration (< 60s)', () => {
    expect(formatTime(5.123, 30)).toBe('5.123')
  })

  it('formats medium duration (60–600s)', () => {
    expect(formatTime(65.5, 90)).toBe('1:05.500')
  })

  it('formats 10+ minute duration', () => {
    expect(formatTime(605.0, 700)).toBe('10:05.000')
  })

  it('formats hour-scale duration', () => {
    expect(formatTime(3661.5, 4000)).toBe('01:01:01.500')
  })

  it('formats 0 seconds', () => {
    expect(formatTime(0, 10)).toBe('0.000')
  })
})

/* formatframecompact */
describe('formatFrameCompact', () => {
  it('formats frame 0', () => {
    expect(formatFrameCompact(0)).toBe('0')
  })

  it('formats a positive frame', () => {
    expect(formatFrameCompact(1234)).toBe('1234')
  })

  it('clamps negative frames to 0', () => {
    expect(formatFrameCompact(-5)).toBe('0')
  })

  it('rounds fractional frames', () => {
    expect(formatFrameCompact(10.7)).toBe('11')
  })
})

/* formatframepadded */
describe('formatFramePadded', () => {
  it('pads to width of totalFrames-1', () => {
    // totalframes=1000 → max frame 999 → 3 chars wide
    expect(formatFramePadded(5, 1000)).toBe('  5')
  })

  it('no padding needed for large frame', () => {
    expect(formatFramePadded(999, 1000)).toBe('999')
  })

  it('handles totalFrames 0', () => {
    expect(formatFramePadded(0, 0)).toBe('0')
  })

  it('pads single-digit totalFrames', () => {
    expect(formatFramePadded(0, 10)).toBe('0')
  })
})
