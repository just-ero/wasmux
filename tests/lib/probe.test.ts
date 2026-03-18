import { describe, it, expect } from 'vitest'
import { parseProbeOutput } from '@/lib/probe'

/* ── helpers ─────────────────────────────────────────────────── */

/** realistic ffmpeg -i output for an mp4 file. */
const SAMPLE_OUTPUT = [
  'ffmpeg version 6.0 Copyright (c) 2000-2023 the FFmpeg developers',
  '  built with emcc (Emscripten)',
  'Input #0, mov,mp4,m4a,3gp,3g2,mj2, from \'input.mp4\':',
  '  Metadata:',
  '    major_brand     : isom',
  '  Duration: 00:01:30.50, start: 0.000000, bitrate: 2500 kb/s',
  '  Stream #0:0(und): Video: h264 (High), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 2000 kb/s, 30 fps, 30 tbr, 90k tbn',
  '  Stream #0:1(und): Audio: aac (LC), 44100 Hz, stereo, fltp, 128 kb/s',
]

/* ── tests ────────────────────────────────────────────────────── */

describe('parseProbeOutput', () => {
  it('parses duration correctly', () => {
    const result = parseProbeOutput(SAMPLE_OUTPUT)
    // 1*60 + 30 + 0.50 = 90.5
    expect(result.duration).toBeCloseTo(90.5)
  })

  it('parses sub-second duration precision from variable-length fractions', () => {
    const lines = [
      'Input #0, mov,mp4,m4a,3gp,3g2,mj2, from \'clip.mp4\':',
      '  Duration: 00:00:01.999, start: 0.000000, bitrate: 1800 kb/s',
      '  Stream #0:0: Video: h264, 1280x720, 30 fps',
    ]
    const result = parseProbeOutput(lines)
    expect(result.duration).toBeCloseTo(1.999)
  })

  it('parses video resolution', () => {
    const result = parseProbeOutput(SAMPLE_OUTPUT)
    expect(result.width).toBe(1920)
    expect(result.height).toBe(1080)
  })

  it('parses fps', () => {
    const result = parseProbeOutput(SAMPLE_OUTPUT)
    expect(result.fps).toBe(30)
  })

  it('parses video codec', () => {
    const result = parseProbeOutput(SAMPLE_OUTPUT)
    expect(result.videoCodec).toBe('h264')
  })

  it('parses video bitrate', () => {
    const result = parseProbeOutput(SAMPLE_OUTPUT)
    expect(result.videoBitrate).toBe(2000)
  })

  it('parses container bitrate', () => {
    const result = parseProbeOutput(SAMPLE_OUTPUT)
    expect(result.containerBitrate).toBe(2500)
  })

  it('parses audio codec', () => {
    const result = parseProbeOutput(SAMPLE_OUTPUT)
    expect(result.audioCodec).toBe('aac')
  })

  it('parses audio sample rate', () => {
    const result = parseProbeOutput(SAMPLE_OUTPUT)
    expect(result.audioSampleRate).toBe(44100)
  })

  it('parses audio channels (stereo)', () => {
    const result = parseProbeOutput(SAMPLE_OUTPUT)
    expect(result.audioChannels).toBe(2)
  })

  it('parses audio bitrate', () => {
    const result = parseProbeOutput(SAMPLE_OUTPUT)
    expect(result.audioBitrate).toBe(128)
  })

  it('parses format', () => {
    const result = parseProbeOutput(SAMPLE_OUTPUT)
    expect(result.format).toBe('mov,mp4,m4a,3gp,3g2,mj2')
  })

  it('populates video tracks', () => {
    const result = parseProbeOutput(SAMPLE_OUTPUT)
    expect(result.videoTracks).toHaveLength(1)
    expect(result.videoTracks[0].codec).toBe('h264')
    expect(result.videoTracks[0].index).toBe(0)
  })

  it('populates audio tracks', () => {
    const result = parseProbeOutput(SAMPLE_OUTPUT)
    expect(result.audioTracks).toHaveLength(1)
    expect(result.audioTracks[0].codec).toBe('aac')
    expect(result.audioTracks[0].index).toBe(1)
  })

  it('returns zeroed result for empty lines', () => {
    const result = parseProbeOutput([])
    expect(result.duration).toBe(0)
    expect(result.width).toBe(0)
    expect(result.height).toBe(0)
    expect(result.fps).toBe(0)
    expect(result.videoTracks).toHaveLength(0)
    expect(result.audioTracks).toHaveLength(0)
  })

  it('parses MKV with subtitle track', () => {
    const lines = [
      'Input #0, matroska,webm, from \'movie.mkv\':',
      '  Duration: 02:15:30.00, start: 0.000000, bitrate: 5000 kb/s',
      '  Stream #0:0: Video: h265 (Main), yuv420p, 3840x2160, 4500 kb/s, 24 fps',
      '  Stream #0:1(eng): Audio: opus, 48000 Hz, 5.1, fltp, 320 kb/s',
      '  Stream #0:2(eng): Subtitle: subrip',
    ]
    const result = parseProbeOutput(lines)
    expect(result.duration).toBeCloseTo(8130)
    expect(result.width).toBe(3840)
    expect(result.height).toBe(2160)
    expect(result.fps).toBe(24)
    expect(result.audioChannels).toBe(6) // 5.1
    expect(result.subtitleTracks).toHaveLength(1)
    expect(result.subtitleTracks[0].codec).toBe('subrip')
    expect(result.format).toBe('matroska,webm')
  })

  it('parses mono audio', () => {
    const lines = [
      'Input #0, wav, from \'voice.wav\':',
      '  Duration: 00:00:05.00, start: 0.000000, bitrate: 256 kb/s',
      '  Stream #0:0: Audio: pcm_s16le, 16000 Hz, mono, s16, 256 kb/s',
    ]
    const result = parseProbeOutput(lines)
    expect(result.audioChannels).toBe(1)
    expect(result.audioSampleRate).toBe(16000)
  })

  it('parses numeric channel layouts like 5.0', () => {
    const lines = [
      'Input #0, matroska,webm, from \'concert.mkv\':',
      '  Duration: 00:00:05.00, start: 0.000000, bitrate: 256 kb/s',
      '  Stream #0:0: Audio: aac, 48000 Hz, 5.0, fltp, 256 kb/s',
    ]
    const result = parseProbeOutput(lines)
    expect(result.audioChannels).toBe(5)
  })

  it('uses the first video stream for top-level video metadata when multiple video tracks exist', () => {
    const lines = [
      'Input #0, matroska,webm, from \'multi-track.mkv\':',
      '  Duration: 00:00:05.00, start: 0.000000, bitrate: 4500 kb/s',
      '  Stream #0:0: Video: h264, 1920x1080, 30 fps',
      '  Stream #0:1: Video: vp9, 1280x720, 24 fps',
    ]
    const result = parseProbeOutput(lines)
    expect(result.videoTracks).toHaveLength(2)
    expect(result.videoCodec).toBe('h264')
    expect(result.width).toBe(1920)
    expect(result.fps).toBe(30)
  })

  it('keeps container bitrate when stream bitrate is omitted', () => {
    const lines = [
      'Input #0, mov,mp4,m4a,3gp,3g2,mj2, from \'clip.mp4\':',
      '  Duration: 00:00:10.00, start: 0.000000, bitrate: 1800 kb/s',
      '  Stream #0:0(und): Video: h264 (High), yuv420p(progressive), 1280x720, 30 fps',
      '  Stream #0:1(und): Audio: aac (LC), 48000 Hz, stereo, fltp',
    ]
    const result = parseProbeOutput(lines)
    expect(result.containerBitrate).toBe(1800)
    expect(result.videoBitrate).toBe(0)
    expect(result.audioBitrate).toBe(0)
  })

  it('parses stream lines that include bracketed stream ids', () => {
    const lines = [
      'Input #0, mov,mp4,m4a,3gp,3g2,mj2, from \'clip.mp4\':',
      '  Duration: 00:00:10.00, start: 0.000000, bitrate: 1800 kb/s',
      '  Stream #0:0[0x1](und): Video: h264 (High), yuv420p(progressive), 1280x720, 30 fps',
      '  Stream #0:1[0x2](und): Audio: aac (LC), 48000 Hz, stereo, fltp, 128 kb/s',
    ]
    const result = parseProbeOutput(lines)
    expect(result.videoTracks).toHaveLength(1)
    expect(result.audioTracks).toHaveLength(1)
    expect(result.videoCodec).toBe('h264')
    expect(result.audioCodec).toBe('aac')
  })
})
