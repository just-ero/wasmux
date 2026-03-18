import { describe, expect, it } from 'vitest'
import { parseProgressSeconds } from '../../src/lib/exportFile'

describe('parseProgressSeconds', () => {
  it('parses ffmpeg time= output with microsecond precision', () => {
    expect(parseProgressSeconds('frame=42 time=00:00:01.123456 bitrate=1234kbits/s')).toBeCloseTo(1.123456)
  })

  it('parses ffmpeg time= output without fractional seconds', () => {
    expect(parseProgressSeconds('frame=42 time=00:01:23 bitrate=1234kbits/s')).toBe(83)
  })

  it('parses ffmpeg -progress out_time_ms output', () => {
    expect(parseProgressSeconds('out_time_ms=2500000')).toBe(2.5)
  })

  it('rejects malformed ffmpeg timestamps with invalid minute or second fields', () => {
    expect(parseProgressSeconds('time=00:99:12.100')).toBeNull()
    expect(parseProgressSeconds('time=00:01:99.100')).toBeNull()
  })

  it('returns null when the log line has no progress timestamp', () => {
    expect(parseProgressSeconds('progress=continue')).toBeNull()
  })
})
