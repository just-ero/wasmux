import { describe, expect, it } from 'vitest'
import { resolveOutputExtension } from '@/lib/outputFormats'

describe('resolveOutputExtension', () => {
  it('keeps the source filename extension for source exports', () => {
    const resolved = resolveOutputExtension('source', 'mov,mp4,m4a,3gp,3g2,mj2', 'clip.mp4')
    expect(resolved).toBe('mp4')
  })

  it('falls back to parsed source format when source filename extension is missing', () => {
    const resolved = resolveOutputExtension('source', 'matroska,webm', 'clip')
    expect(resolved).toBe('mkv')
  })
})
