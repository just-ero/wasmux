import { describe, expect, it } from 'vitest'
import { isErrorOutputLine, normalizeOutputChannel } from '@/core/output/normalize'

describe('normalizeOutputChannel', () => {
  it('normalizes known stdout aliases', () => {
    expect(normalizeOutputChannel('stdout')).toBe('stdout')
    expect(normalizeOutputChannel('out')).toBe('stdout')
    expect(normalizeOutputChannel('ffout')).toBe('stdout')
  })

  it('normalizes known stderr aliases', () => {
    expect(normalizeOutputChannel('stderr')).toBe('stderr')
    expect(normalizeOutputChannel('err')).toBe('stderr')
    expect(normalizeOutputChannel('fferr')).toBe('stderr')
  })

  it('falls back to info for unknown channels', () => {
    expect(normalizeOutputChannel('custom')).toBe('info')
    expect(normalizeOutputChannel(undefined)).toBe('info')
  })
})

describe('isErrorOutputLine', () => {
  it('detects generic error/failure terms', () => {
    expect(isErrorOutputLine('error: failed to open file')).toBe(true)
    expect(isErrorOutputLine('Fatal: unable to proceed')).toBe(true)
    expect(isErrorOutputLine('Process aborted')).toBe(true)
  })

  it('does not mark informational lines as errors', () => {
    expect(isErrorOutputLine('Input #0, matroska,webm, from file.mkv')).toBe(false)
    expect(isErrorOutputLine('Stream mapping:')).toBe(false)
    expect(isErrorOutputLine('progress=continue')).toBe(false)
  })
})
