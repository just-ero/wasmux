import { describe, expect, it } from 'vitest'
import { buildGifFallbackArgs, buildSafeFallbackArgs } from '@/lib/exportFile'

describe('buildSafeFallbackArgs', () => {
  it('removes incompatible codec flags and forces safe mp4 profile', () => {
    const sourceArgs = [
      '-ss', '1.000000',
      '-i', 'input.mkv',
      '-map', '0:0',
      '-map', '0:1?',
      '-sn', '-dn',
      '-c:v', 'libvpx-vp9',
      '-crf', '28',
      '-preset', 'slow',
      '-pix_fmt', 'yuv420p',
      '-threads', '4',
      '-c:a', 'libopus',
      '-b:a', '192k',
      '-vf', 'crop=640:360:0:0',
      '-af', 'volume=1.25',
      '-y', 'input_out.webm',
    ]

    const fallback = buildSafeFallbackArgs(sourceArgs, 'input_out.mp4')

    expect(fallback).toContain('-c:v')
    expect(fallback[fallback.indexOf('-c:v') + 1]).toBe('libx264')
    expect(fallback).toContain('-preset')
    expect(fallback[fallback.indexOf('-preset') + 1]).toBe('ultrafast')
    expect(fallback).toContain('-crf')
    expect(fallback[fallback.indexOf('-crf') + 1]).toBe('30')
    expect(fallback).toContain('-c:a')
    expect(fallback[fallback.indexOf('-c:a') + 1]).toBe('aac')
    expect(fallback).toContain('-movflags')
    expect(fallback[fallback.indexOf('-movflags') + 1]).toBe('+faststart')
    expect(fallback[fallback.length - 1]).toBe('input_out.mp4')
  })
})

describe('buildGifFallbackArgs', () => {
  it('keeps crop and applies low-cost gif fallback filters', () => {
    const sourceArgs = [
      '-i', 'input.mp4',
      '-map', '0:0',
      '-an',
      '-vf', 'crop=800:600:100:50,fps=12,scale=480:-1:flags=lanczos',
      '-c:v', 'gif',
      '-threads', '4',
      '-filter_threads', '4',
      '-y', 'input_out.gif',
    ]

    const fallback = buildGifFallbackArgs(sourceArgs, 'input_out_fallback.gif')
    const vfIdx = fallback.indexOf('-vf')

    expect(vfIdx).toBeGreaterThan(-1)
    expect(fallback[vfIdx + 1]).toContain('crop=800:600:100:50')
    expect(fallback[vfIdx + 1]).toContain('fps=5')
    expect(fallback[vfIdx + 1]).toContain('scale=min(320\\,iw):-1:flags=fast_bilinear')
    expect(fallback[fallback.length - 1]).toBe('input_out_fallback.gif')
  })
})
