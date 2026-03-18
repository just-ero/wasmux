import { describe, expect, it } from 'vitest'
import { normalizeCopiedLogText } from '@/components/shared/LogPanel'

describe('normalizeCopiedLogText', () => {
  it('coalesces standalone marker lines into readable log lines', () => {
    const raw = [
      'x',
      'ingest failed: sample.mp4',
      '.',
      '.',
      '.',
      'writing to wasm fs',
    ].join('\n')

    const normalized = normalizeCopiedLogText(raw)

    expect(normalized).toBe([
      'x ingest failed: sample.mp4',
      '... writing to wasm fs',
    ].join('\n'))
  })

  it('drops empty lines while preserving content lines', () => {
    const raw = ['  ', 'hello world', '', '  >', 'stdout line'].join('\n')
    const normalized = normalizeCopiedLogText(raw)
    expect(normalized).toBe(['hello world', '> stdout line'].join('\n'))
  })
})
