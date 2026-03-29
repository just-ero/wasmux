import { describe, expect, it } from 'vitest'
import { buildWebmFallbackArgs, isLikelyWasmDecodeFault, isWasmMemoryFault, parseProgressSeconds, shouldDisplayEncodeLogLine } from '@/lib/exportFile'

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

describe('shouldDisplayEncodeLogLine', () => {
  it('suppresses ffmpeg banner/version noise', () => {
    expect(shouldDisplayEncodeLogLine('ffmpeg version 5.1.4')).toBe(false)
    expect(shouldDisplayEncodeLogLine('  configuration: --target-os=none')).toBe(false)
    expect(shouldDisplayEncodeLogLine('  libavcodec     59. 37.100 / 59. 37.100')).toBe(false)
  })

  it('keeps key encode context and stream mapping lines', () => {
    expect(shouldDisplayEncodeLogLine('Input #0, matroska,webm, from \'in.mkv\':')).toBe(true)
    expect(shouldDisplayEncodeLogLine('Duration: 01:24:40.35, start: 0.000000, bitrate: 3147 kb/s')).toBe(true)
    expect(shouldDisplayEncodeLogLine('Stream #0:0: Video: hevc (Main 10), yuv420p10le, 1920x824')).toBe(true)
    expect(shouldDisplayEncodeLogLine('Stream mapping:')).toBe(true)
  })

  it('keeps frame/progress and error lines', () => {
    expect(shouldDisplayEncodeLogLine('frame=  240 fps=4.0 q=31.0 size=1024kB time=00:00:10.00')).toBe(true)
    expect(shouldDisplayEncodeLogLine('out_time_ms=2500000')).toBe(true)
    expect(shouldDisplayEncodeLogLine('Error initializing output stream 0:1')).toBe(true)
  })
})

describe('buildWebmFallbackArgs', () => {
  it('keeps webm output and swaps to fast vp8/vorbis fallback', () => {
    const sourceArgs = [
      '-i', 'in.mkv',
      '-map', '0:0',
      '-map', '0:1?',
      '-sn', '-dn',
      '-c:v', 'libvpx-vp9',
      '-crf', '23',
      '-b:v', '0',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-ac', '2',
      '-vf', 'scale=1280:720:flags=fast_bilinear',
      '-y', 'out.webm',
    ]

    const args = buildWebmFallbackArgs(sourceArgs, 'out-fallback.webm')
    expect(args).toContain('-c:v')
    expect(args[args.indexOf('-c:v') + 1]).toBe('libvpx')
    expect(args).toContain('-c:a')
    expect(args[args.indexOf('-c:a') + 1]).toBe('libvorbis')
    expect(args[args.indexOf('-y') + 1]).toBe('out-fallback.webm')
  })

  it('preserves existing audio/video filters when present', () => {
    const sourceArgs = [
      '-i', 'in.mkv',
      '-af', 'volume=1.200',
      '-vf', 'crop=800:600:0:0',
      '-y', 'out.webm',
    ]

    const args = buildWebmFallbackArgs(sourceArgs, 'out-fallback.webm')
    expect(args).toContain('-af')
    expect(args[args.indexOf('-af') + 1]).toBe('volume=1.200')
    expect(args).toContain('-vf')
    expect(args[args.indexOf('-vf') + 1]).toBe('crop=800:600:0:0')
  })
})

describe('isWasmMemoryFault', () => {
  it('detects memory access out of bounds runtime errors', () => {
    expect(isWasmMemoryFault(new Error('RuntimeError: memory access out of bounds'))).toBe(true)
  })

  it('detects generic out of memory errors', () => {
    expect(isWasmMemoryFault(new Error('out of memory while allocating'))).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isWasmMemoryFault(new Error('Conversion failed'))).toBe(false)
  })
})

describe('isLikelyWasmDecodeFault', () => {
  it('detects known wasm decode capability failures', () => {
    expect(isLikelyWasmDecodeFault(new Error('[av1 @ 0xdef780] Failed to get pixel format.'))).toBe(true)
    expect(isLikelyWasmDecodeFault('Error while decoding stream #0:0: Function not implemented')).toBe(true)
    expect(isLikelyWasmDecodeFault('Conversion failed!')).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isLikelyWasmDecodeFault(new Error('Permission denied while saving file'))).toBe(false)
  })
})
