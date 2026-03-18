import { describe, it, expect, beforeEach } from 'vitest'
import { buildCommand } from '@/lib/commandBuilder'
import { useEditorStore } from '@/stores/editorStore'
import type { ProbeResult, VideoProps, AudioProps, Selection } from '@/types/editor'

/* ── helpers ─────────────────────────────────────────────────── */

const defaultProbe: ProbeResult = {
  duration: 10,
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: 'h264',
  audioCodec: 'aac',
  containerBitrate: 2128,
  videoBitrate: 2000,
  audioBitrate: 128,
  audioSampleRate: 44100,
  audioChannels: 2,
  videoTracks: [{ index: 0, codec: 'h264', label: 'h264' }],
  audioTracks: [{ index: 1, codec: 'aac', label: 'aac' }],
  subtitleTracks: [],
  format: 'mp4',
}

const defaultVideoProps: VideoProps = {
  codec: 'copy',
  preset: 'medium',
  crf: 23,
  profile: 'high',
  tune: '',
  width: null,
  height: null,
  fps: null,
  speed: 1,
  gifFps: null,
  gifWidth: null,
  gifHeight: null,
  trackIndex: 0,
  subtitleTrackIndex: null,
  keepAspectRatio: true,
}

const defaultAudioProps: AudioProps = {
  codec: 'copy',
  bitrate: 128,
  volume: 1,
  speed: 1,
  pitch: 0,
  trackIndex: 0,
}

function setup(overrides: {
  probe?: Partial<ProbeResult>
  videoProps?: Partial<VideoProps>
  audioProps?: Partial<AudioProps>
  selections?: Selection[]
  crop?: { x: number; y: number; width: number; height: number } | null
  fileName?: string
} = {}) {
  const probe = { ...defaultProbe, ...overrides.probe }
  const totalFrames = probe.fps > 0 ? Math.round(probe.duration * probe.fps) : 0
  useEditorStore.setState({
    file: { name: overrides.fileName ?? 'input.mp4', size: 1000, type: 'video/mp4', objectUrl: 'blob:test' },
    probe,
    totalFrames,
    selections: overrides.selections ?? [{ id: 'full', start: 0, end: Math.max(0, totalFrames - 1) }],
    crop: overrides.crop ?? null,
    videoProps: { ...defaultVideoProps, ...overrides.videoProps },
    audioProps: { ...defaultAudioProps, ...overrides.audioProps },
  })
}

beforeEach(() => {
  useEditorStore.setState({
    file: null,
    probe: null,
    totalFrames: 0,
    selections: [],
    crop: null,
    videoProps: { ...defaultVideoProps },
    audioProps: { ...defaultAudioProps },
    outputFormat: 'source',
  })
})

/* ── tests ────────────────────────────────────────────────────── */

describe('buildCommand', () => {
  it('throws when no file is loaded', () => {
    expect(() => buildCommand('mp4')).toThrow('No file loaded')
  })

  describe('stream copy (no trim, no crop)', () => {
    it('produces copy args for source format', () => {
      setup()
      const { args, outputName, needsReencode } = buildCommand('source')
      expect(needsReencode).toBe(false)
      expect(args).toContain('-c:v')
      expect(args[args.indexOf('-c:v') + 1]).toBe('copy')
      expect(args).toContain('-c:a')
      expect(args[args.indexOf('-c:a') + 1]).toBe('copy')
      expect(outputName).toBe('input_out.mp4')
    })

    it('resolves output extension from source format', () => {
      setup({ probe: { format: 'matroska,webm' } })
      const { outputName } = buildCommand('source')
      expect(outputName).toBe('input_out.mkv')
    })

    it('uses explicit format extension', () => {
      setup()
      const { outputName } = buildCommand('webm')
      expect(outputName).toBe('input_out.webm')
    })

    it('maps selected tracks by absolute stream index', () => {
      setup({
        videoProps: { trackIndex: 2 },
        audioProps: { trackIndex: 5 },
      })
      const { args } = buildCommand('mp4')
      const firstMapIdx = args.indexOf('-map')
      const secondMapIdx = args.indexOf('-map', firstMapIdx + 1)
      expect(args[firstMapIdx + 1]).toBe('0:2')
      expect(args[secondMapIdx + 1]).toBe('0:5?')
    })
  })

  describe('trimming', () => {
    it('adds -ss and -t when trimmed', () => {
      setup({ selections: [{ id: 'full', start: 30, end: 89 }] })
      const { args } = buildCommand('mp4')
      expect(args).toContain('-ss')
      expect(args).toContain('-t')
      // -ss should be before -i
      const ssIdx = args.indexOf('-ss')
      const iIdx = args.indexOf('-i')
      expect(ssIdx).toBeLessThan(iIdx)
    })

    it('treats the out frame as inclusive when computing duration', () => {
      setup({ selections: [{ id: 'full', start: 30, end: 89 }] })
      const { args } = buildCommand('mp4')
      expect(args[args.indexOf('-t') + 1]).toBe('2.000000')
    })

    it('does not add -ss/-t when full range selected', () => {
      setup()
      const { args } = buildCommand('mp4')
      expect(args).not.toContain('-ss')
      expect(args).not.toContain('-t')
    })

    it('uses accurate seek (-ss after -i) when re-encoding', () => {
      setup({
        selections: [{ id: 'full', start: 25, end: 224 }],
        crop: { x: 10, y: 10, width: 640, height: 360 },
      })
      const { args } = buildCommand('mkv')
      const ssIdx = args.indexOf('-ss')
      const iIdx = args.indexOf('-i')
      expect(ssIdx).toBeGreaterThan(iIdx)
    })

    it('uses fast seek (-ss before -i) for gif exports', () => {
      setup({
        selections: [{ id: 'full', start: 3800, end: 3920 }],
        crop: { x: 10, y: 10, width: 640, height: 360 },
      })
      const { args } = buildCommand('gif')
      const ssIdx = args.indexOf('-ss')
      const iIdx = args.indexOf('-i')
      expect(ssIdx).toBeLessThan(iIdx)
    })

    it('uses fast seek for mp4 stream-copy trims at non-keyframe candidates', () => {
      setup({
        probe: { fps: 30, format: 'mp4' },
        selections: [{ id: 'full', start: 37, end: 121 }],
        videoProps: { codec: 'copy' },
        audioProps: { codec: 'copy' },
      })
      const { args, needsReencode } = buildCommand('mp4')
      expect(needsReencode).toBe(false)
      const ssIdx = args.indexOf('-ss')
      const iIdx = args.indexOf('-i')
      expect(ssIdx).toBeGreaterThanOrEqual(0)
      expect(ssIdx).toBeLessThan(iIdx)
      expect(args[args.indexOf('-c:v') + 1]).toBe('copy')
      expect(args[args.indexOf('-ss') + 1]).toBe('1.233333')
    })

    it('switches to accurate seek for mp4 trims when re-encoding is required', () => {
      setup({
        probe: { fps: 30, format: 'mp4' },
        selections: [{ id: 'full', start: 37, end: 121 }],
        crop: { x: 3, y: 5, width: 641, height: 359 },
        videoProps: { codec: 'copy' },
      })
      const { args, needsReencode } = buildCommand('mp4')
      expect(needsReencode).toBe(true)
      const ssIdx = args.indexOf('-ss')
      const iIdx = args.indexOf('-i')
      expect(ssIdx).toBeGreaterThan(iIdx)
      expect(args[args.indexOf('-c:v') + 1]).toBe('libx264')
    })
  })

  describe('crop', () => {
    it('forces re-encode when crop is set', () => {
      setup({ crop: { x: 100, y: 50, width: 800, height: 600 } })
      const { args, needsReencode } = buildCommand('mp4')
      expect(needsReencode).toBe(true)
      expect(args).toContain('-vf')
      const vfIdx = args.indexOf('-vf')
      expect(args[vfIdx + 1]).toMatch(/^crop=/)
    })

    it('clamps crop to source dimensions', () => {
      setup({
        probe: { width: 1920, height: 1080 },
        crop: { x: 1900, y: 1060, width: 100, height: 100 },
      })
      const { args } = buildCommand('mp4')
      const vfIdx = args.indexOf('-vf')
      const cropFilter = args[vfIdx + 1]
      // width/height should be clamped so they don't exceed source bounds
      const match = cropFilter.match(/crop=(\d+):(\d+):(\d+):(\d+)/)
      expect(match).not.toBeNull()
      const [, cw, ch, cx, cy] = match!.map(Number)
      expect(cx + cw).toBeLessThanOrEqual(1920)
      expect(cy + ch).toBeLessThanOrEqual(1080)
    })

    it('clamps crop origin so width/height remain in bounds', () => {
      setup({
        probe: { width: 1920, height: 1080 },
        crop: { x: 1920, y: 1080, width: 200, height: 200 },
      })
      const { args } = buildCommand('mp4')
      const vfIdx = args.indexOf('-vf')
      const cropFilter = args[vfIdx + 1]
      const match = cropFilter.match(/crop=(\d+):(\d+):(\d+):(\d+)/)
      expect(match).not.toBeNull()
      const [, cw, ch, cx, cy] = match!.map(Number)
      expect(cx).toBeLessThan(1920)
      expect(cy).toBeLessThan(1080)
      expect(cx + cw).toBeLessThanOrEqual(1920)
      expect(cy + ch).toBeLessThanOrEqual(1080)
    })

    it('normalizes crop values to even dimensions for libx264', () => {
      setup({
        crop: { x: 101, y: 51, width: 801, height: 601 },
        videoProps: { codec: 'copy' },
      })
      const { args } = buildCommand('mp4')
      const vfIdx = args.indexOf('-vf')
      expect(args[vfIdx + 1]).toBe('crop=800:600:100:50')
    })

    it('keeps odd crop values for codecs that do not require even dimensions', () => {
      setup({
        crop: { x: 101, y: 51, width: 801, height: 601 },
        videoProps: { codec: 'libtheora' },
      })
      const { args } = buildCommand('ogg')
      const vfIdx = args.indexOf('-vf')
      expect(args[vfIdx + 1]).toContain('crop=801:601:101:51')
    })
  })

  describe('codecs', () => {
    it('re-encodes and applies an fps filter when output fps is reduced', () => {
      setup({ videoProps: { fps: 24 } })
      const { args, needsReencode } = buildCommand('mp4')
      expect(needsReencode).toBe(true)
      expect(args).toContain('-vf')
      expect(args[args.indexOf('-vf') + 1]).toContain('fps=24')
      expect(args[args.indexOf('-c:v') + 1]).toBe('libx264')
    })

    it('does not add an fps filter when requested fps matches the source', () => {
      setup({ videoProps: { fps: 30 } })
      const { args, needsReencode } = buildCommand('mp4')
      expect(needsReencode).toBe(false)
      expect(args).not.toContain('-vf')
    })

    it('uses libx264 with preset/crf when video codec is libx264', () => {
      setup({
        videoProps: { codec: 'libx264', crf: 18, preset: 'slow', profile: 'high' },
        crop: { x: 0, y: 0, width: 1920, height: 1080 },
      })
      const { args } = buildCommand('mp4')
      expect(args).toContain('-c:v')
      expect(args[args.indexOf('-c:v') + 1]).toBe('libx264')
      expect(args).toContain('-preset')
      expect(args[args.indexOf('-preset') + 1]).toBe('slow')
      expect(args).toContain('-crf')
      expect(args[args.indexOf('-crf') + 1]).toBe('18')
      expect(args).toContain('-pix_fmt')
      expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p')
      expect(args).toContain('-threads')
      expect(args[args.indexOf('-threads') + 1]).toBe('1')
    })

    it('falls back to libx264 when video copy + crop forces reencode', () => {
      setup({
        videoProps: { codec: 'copy' },
        crop: { x: 0, y: 0, width: 800, height: 600 },
      })
      const { args } = buildCommand('mp4')
      expect(args[args.indexOf('-c:v') + 1]).toBe('libx264')
      expect(args[args.indexOf('-preset') + 1]).toBe('ultrafast')
    })

    it('uses aac when audio codec is not copy', () => {
      setup({ audioProps: { codec: 'aac', bitrate: 192 } })
      // need reencode trigger for audio to matter
      const { args } = buildCommand('mp4')
      expect(args).toContain('-c:a')
      expect(args[args.indexOf('-c:a') + 1]).toBe('aac')
      expect(args).toContain('-b:a')
      expect(args[args.indexOf('-b:a') + 1]).toBe('192k')
    })

    it('auto-switches audio copy to aac when audio filters are active', () => {
      setup({ audioProps: { codec: 'copy', volume: 1.25 } })
      const { args } = buildCommand('mp4')
      expect(args).toContain('-c:a')
      expect(args[args.indexOf('-c:a') + 1]).toBe('aac')
      expect(args).toContain('-af')
    })

    it('adds audio filters for volume, speed, and pitch', () => {
      setup({ audioProps: { codec: 'aac', volume: 1.5, speed: 1.2, pitch: 3 } })
      const { args } = buildCommand('mp4')
      expect(args).toContain('-af')
      const af = args[args.indexOf('-af') + 1]
      expect(af).toContain('volume=1.500')
      expect(af).toContain('asetrate=')
      expect(af).toContain('aresample=44100')
      expect(af).toContain('atempo=')
    })

    it('uses gif video output and disables audio for gif exports', () => {
      setup({
        fileName: 'input.mkv',
        crop: { x: 32, y: 20, width: 640, height: 360 },
        selections: [{ id: 'full', start: 10, end: 90 }],
      })
      const { args, outputName, needsReencode } = buildCommand('gif')
      expect(needsReencode).toBe(true)
      expect(outputName).toBe('input_out.gif')
      expect(args).toContain('-an')
      expect(args).not.toContain('-c:a')
      expect(args[args.indexOf('-c:v') + 1]).toBe('gif')
      expect(args).toContain('-vf')
      expect(args[args.indexOf('-vf') + 1]).toContain('crop=')
      expect(args[args.indexOf('-vf') + 1]).toContain('fps=8')
      expect(args[args.indexOf('-vf') + 1]).toContain('scale=min(480\\,iw):-1:flags=fast_bilinear')
    })

    it('uses libvpx-vp9 with crf and zero target bitrate', () => {
      setup({
        videoProps: { codec: 'libvpx-vp9', crf: 31 },
        crop: { x: 0, y: 0, width: 1280, height: 720 },
      })
      const { args, needsReencode } = buildCommand('webm')
      expect(needsReencode).toBe(true)
      expect(args[args.indexOf('-c:v') + 1]).toBe('libvpx-vp9')
      expect(args[args.indexOf('-crf') + 1]).toBe('31')
      expect(args[args.indexOf('-b:v') + 1]).toBe('0')
    })

    it('normalizes crop to even values for libvpx-vp9', () => {
      setup({
        videoProps: { codec: 'libvpx-vp9' },
        crop: { x: 101, y: 51, width: 801, height: 601 },
      })
      const { args } = buildCommand('webm')
      expect(args).toContain('-vf')
      expect(args[args.indexOf('-vf') + 1]).toContain('crop=800:600:100:50')
    })

    it('uses mpeg4 codec and normalizes odd crop values to even numbers', () => {
      setup({
        videoProps: { codec: 'mpeg4' },
        crop: { x: 21, y: 31, width: 301, height: 201 },
      })
      const { args } = buildCommand('avi')
      expect(args[args.indexOf('-c:v') + 1]).toBe('mpeg4')
      expect(args).toContain('-vf')
      expect(args[args.indexOf('-vf') + 1]).toContain('crop=300:200:20:30')
    })

    it('uses libtheora when selected', () => {
      setup({
        videoProps: { codec: 'libtheora' },
        crop: { x: 0, y: 0, width: 640, height: 360 },
      })
      const { args } = buildCommand('ogg')
      expect(args[args.indexOf('-c:v') + 1]).toBe('libtheora')
    })

    it.each([
      ['libmp3lame', 'mp3'],
      ['libvorbis', 'ogg'],
      ['libopus', 'webm'],
      ['flac', 'wav'],
      ['ac3', 'mov'],
    ] as const)('uses %s for %s audio exports', (codec, format) => {
      setup({
        audioProps: { codec, bitrate: 192 },
      })
      const { args } = buildCommand(format)
      expect(args).toContain('-c:a')
      expect(args[args.indexOf('-c:a') + 1]).toBe(codec)
      expect(args).toContain('-b:a')
      expect(args[args.indexOf('-b:a') + 1]).toBe('192k')
    })

    it('produces audio-only mapping when video track is disabled', () => {
      setup({
        videoProps: { trackIndex: null },
        audioProps: { trackIndex: 1, codec: 'aac' },
      })
      const { args } = buildCommand('mp3')
      expect(args).toContain('-vn')
      expect(args).not.toContain('-map 0:0')
      const mapIdx = args.indexOf('-map')
      expect(mapIdx).toBeGreaterThanOrEqual(0)
      expect(args[mapIdx + 1]).toBe('0:1?')
    })

    it('produces video-only mapping when audio track is disabled', () => {
      setup({
        videoProps: { trackIndex: 0, codec: 'libx264' },
        audioProps: { trackIndex: null },
        crop: { x: 0, y: 0, width: 640, height: 360 },
      })
      const { args } = buildCommand('mp4')
      expect(args).toContain('-an')
      expect(args).toContain('-map')
      expect(args[args.indexOf('-map') + 1]).toBe('0:0')
    })

    it('caps gif fps to the source fps', () => {
      setup({
        probe: { fps: 6 },
        videoProps: { gifFps: 12 },
      })
      const { args } = buildCommand('gif')
      expect(args).toContain('-vf')
      expect(args[args.indexOf('-vf') + 1]).toContain('fps=6')
    })

    it('uses exact gif width/height when aspect ratio lock is disabled', () => {
      setup({
        videoProps: {
          gifWidth: 300,
          gifHeight: 200,
          keepAspectRatio: false,
        },
      })
      const { args } = buildCommand('gif')
      expect(args).toContain('-vf')
      expect(args[args.indexOf('-vf') + 1]).toContain('scale=300:200:flags=fast_bilinear')
      expect(args[args.indexOf('-vf') + 1]).not.toContain('force_original_aspect_ratio=decrease')
    })

    it('falls back to default gif fps when configured gif fps is invalid', () => {
      setup({
        probe: { fps: 24 },
        videoProps: { gifFps: -5 },
      })
      const { args } = buildCommand('gif')
      expect(args).toContain('-vf')
      expect(args[args.indexOf('-vf') + 1]).toContain('fps=8')
    })

    it('builds a conversion command for mkv source to webm with vp9, opus, crop and pitch shift', () => {
      setup({
        probe: {
          format: 'matroska,webm',
          videoCodec: 'h265',
          audioCodec: 'opus',
          audioSampleRate: 48000,
        },
        videoProps: {
          codec: 'libvpx-vp9',
          crf: 30,
        },
        audioProps: {
          codec: 'libopus',
          pitch: 3,
          bitrate: 160,
          trackIndex: 1,
        },
        crop: { x: 1, y: 3, width: 1279, height: 719 },
      })

      const { args, outputName, needsReencode } = buildCommand('webm')
      expect(needsReencode).toBe(true)
      expect(outputName).toBe('input_out.webm')
      expect(args[args.indexOf('-c:v') + 1]).toBe('libvpx-vp9')
      expect(args[args.indexOf('-c:a') + 1]).toBe('libopus')
      expect(args).toContain('-vf')
      expect(args[args.indexOf('-vf') + 1]).toContain('crop=1278:718:0:2')
      expect(args).toContain('-af')
      const af = args[args.indexOf('-af') + 1]
      expect(af).toContain('asetrate=')
      expect(af).toContain('aresample=48000')
      expect(af).toContain('atempo=')
    })
  })

  describe('format flags', () => {
    it('adds movflags for mp4', () => {
      setup()
      const { args } = buildCommand('mp4')
      expect(args).toContain('-movflags')
      expect(args[args.indexOf('-movflags') + 1]).toBe('+faststart')
    })

    it('does not add movflags for mkv', () => {
      setup()
      const { args } = buildCommand('mkv')
      expect(args).not.toContain('-movflags')
    })
  })

  describe('output naming', () => {
    it('strips extension and adds _out', () => {
      setup({ fileName: 'my video.webm' })
      const { outputName } = buildCommand('mp4')
      expect(outputName).toBe('my video_out.mp4')
    })
  })

  describe('source format resolution', () => {
    it.each([
      ['matroska,webm', 'mkv'],
      ['webm', 'webm'],
      ['avi', 'avi'],
      ['mov,mp4,m4a,3gp,3g2,mj2', 'mp4'],
      ['ogg', 'ogg'],
      ['flv', 'flv'],
      ['wav', 'wav'],
      ['mp3', 'mp3'],
    ] as const)('resolves %s → .%s', (format, ext) => {
      setup({ probe: { format } })
      const { outputName } = buildCommand('source')
      expect(outputName).toMatch(new RegExp(`\\.${ext}$`))
    })

    it('defaults to mp4 for unknown format', () => {
      setup({ probe: { format: 'totally_unknown' } })
      const { outputName } = buildCommand('source')
      expect(outputName).toMatch(/\.mp4$/)
    })
  })

  describe('all output formats produce valid commands', () => {
    const formats = ['avi', 'flv', 'gif', 'mkv', 'mov', 'mp3', 'mp4', 'ogg', 'wav', 'webm'] as const
    it.each(formats)('builds a command for .%s', (fmt) => {
      setup()
      const { args, outputName } = buildCommand(fmt)
      expect(outputName).toMatch(new RegExp(`\\.${fmt}$`))
      expect(args).toContain('-i')
      expect(args).toContain('-y')
    })

    it.each(formats)('keeps explicit output format when input is %s and format is selected directly', (fmt) => {
      setup({ probe: { format: 'mov,mp4,m4a,3gp,3g2,mj2' }, fileName: 'source.mov' })
      const { outputName } = buildCommand(fmt)
      expect(outputName).toBe(`source_out.${fmt}`)
    })
  })
})
