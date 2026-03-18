import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '@/stores/editorStore'
import type { ProbeResult, Selection, CropRegion } from '@/types/editor'

/* ── helpers ─────────────────────────────────────────────────── */

const stubProbe: ProbeResult = {
  duration: 10,
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: 'h264',
  audioCodec: 'aac',
  containerBitrate: 5128,
  videoBitrate: 5000,
  audioBitrate: 128,
  audioSampleRate: 44100,
  audioChannels: 2,
  videoTracks: [],
  audioTracks: [],
  subtitleTracks: [],
  format: 'mp4',
}

const stubFile = { name: 'test.mp4', size: 1024, type: 'video/mp4', objectUrl: 'blob:test' }

function reset() {
  useEditorStore.setState({
    file: null,
    probe: null,
    previewUrl: null,
    totalFrames: 0,
    currentFrame: 0,
    keyframes: [],
    ingestionStatus: 'idle',
    selections: [],
    crop: null,
    cropMode: false,
    videoProps: { codec: 'copy', preset: 'medium', crf: 23, profile: 'high', tune: '', width: null, height: null, fps: null, speed: 1, gifFps: null, gifWidth: null, gifHeight: null, trackIndex: 0, subtitleTrackIndex: null, keepAspectRatio: true },
    audioProps: { codec: 'copy', bitrate: 128, volume: 1, speed: 1, pitch: 0, trackIndex: 0 },
    outputFormat: 'source',
    activeTab: 'video',
    isExporting: false,
    showFrames: false,
  })
}

/* ── tests ────────────────────────────────────────────────────── */

beforeEach(reset)

describe('loadFile', () => {
  it('computes totalFrames from duration * fps', () => {
    useEditorStore.getState().loadFile(stubFile, stubProbe)
    expect(useEditorStore.getState().totalFrames).toBe(300) // 10s * 30fps
  })

  it('creates a full selection spanning all frames', () => {
    useEditorStore.getState().loadFile(stubFile, stubProbe)
    const sel = useEditorStore.getState().selections
    expect(sel).toHaveLength(1)
    expect(sel[0].start).toBe(0)
    expect(sel[0].end).toBe(299) // totalframes - 1
  })

  it('resets editing state', () => {
    useEditorStore.setState({ crop: { x: 10, y: 10, width: 100, height: 100 }, cropMode: true })
    useEditorStore.getState().loadFile(stubFile, stubProbe)
    expect(useEditorStore.getState().crop).toBeNull()
    expect(useEditorStore.getState().cropMode).toBe(false)
  })

  it('handles 0 fps gracefully', () => {
    useEditorStore.getState().loadFile(stubFile, { ...stubProbe, fps: 0 })
    expect(useEditorStore.getState().totalFrames).toBe(0)
    expect(useEditorStore.getState().selections[0].end).toBe(0)
  })

  it('defaults track selections to the first available streams', () => {
    useEditorStore.getState().loadFile(stubFile, {
      ...stubProbe,
      videoTracks: [{ index: 2, codec: 'h264', label: 'h264 (eng)' }],
      audioTracks: [{ index: 5, codec: 'aac', label: 'aac (eng)' }],
    })
    expect(useEditorStore.getState().videoProps.trackIndex).toBe(2)
    expect(useEditorStore.getState().audioProps.trackIndex).toBe(5)
  })

  it('sets track indices to null when the source has no matching streams', () => {
    useEditorStore.getState().loadFile(stubFile, {
      ...stubProbe,
      videoTracks: [],
      audioTracks: [],
    })
    expect(useEditorStore.getState().videoProps.trackIndex).toBeNull()
    expect(useEditorStore.getState().audioProps.trackIndex).toBeNull()
  })
})

describe('setSelections', () => {
  beforeEach(() => {
    useEditorStore.getState().loadFile(stubFile, stubProbe)
  })

  it('clamps start to >= 0', () => {
    useEditorStore.getState().setSelections([{ id: 'a', start: -10, end: 100 }])
    expect(useEditorStore.getState().selections[0].start).toBe(0)
  })

  it('clamps end to totalFrames - 1', () => {
    useEditorStore.getState().setSelections([{ id: 'a', start: 0, end: 9999 }])
    expect(useEditorStore.getState().selections[0].end).toBe(299)
  })

  it('ensures start <= end by clamping start to min(start, end)', () => {
    useEditorStore.getState().setSelections([{ id: 'a', start: 200, end: 100 }])
    const sel = useEditorStore.getState().selections[0]
    expect(sel.start).toBeLessThanOrEqual(sel.end)
  })

  it('preserves valid selections unchanged', () => {
    const input: Selection[] = [{ id: 'a', start: 50, end: 150 }]
    useEditorStore.getState().setSelections(input)
    const sel = useEditorStore.getState().selections[0]
    expect(sel.start).toBe(50)
    expect(sel.end).toBe(150)
  })

  it('handles multiple selections', () => {
    useEditorStore.getState().setSelections([
      { id: 'a', start: 0, end: 100 },
      { id: 'b', start: 200, end: 299 },
    ])
    expect(useEditorStore.getState().selections).toHaveLength(2)
  })
})

describe('setInPoint / setOutPoint', () => {
  beforeEach(() => {
    useEditorStore.getState().loadFile(stubFile, stubProbe)
    useEditorStore.getState().setSelections([{ id: 'full', start: 20, end: 40 }])
  })

  it('setInPoint updates start and preserves ordering', () => {
    useEditorStore.getState().setInPoint(30)
    expect(useEditorStore.getState().selections[0]).toEqual({ id: 'full', start: 30, end: 40 })

    useEditorStore.getState().setInPoint(50)
    expect(useEditorStore.getState().selections[0]).toEqual({ id: 'full', start: 40, end: 50 })
  })

  it('setOutPoint updates end and preserves ordering', () => {
    useEditorStore.getState().setOutPoint(35)
    expect(useEditorStore.getState().selections[0]).toEqual({ id: 'full', start: 20, end: 35 })

    useEditorStore.getState().setOutPoint(10)
    expect(useEditorStore.getState().selections[0]).toEqual({ id: 'full', start: 10, end: 20 })
  })
})

describe('setCrop', () => {
  beforeEach(() => {
    useEditorStore.getState().loadFile(stubFile, stubProbe)
  })

  it('sets crop to null when passed null', () => {
    useEditorStore.getState().setCrop({ x: 10, y: 10, width: 100, height: 100 })
    useEditorStore.getState().setCrop(null)
    expect(useEditorStore.getState().crop).toBeNull()
  })

  it('clamps x and y to >= 0', () => {
    useEditorStore.getState().setCrop({ x: -50, y: -30, width: 100, height: 100 })
    const crop = useEditorStore.getState().crop!
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(0)
  })

  it('clamps x to probe width', () => {
    useEditorStore.getState().setCrop({ x: 2000, y: 0, width: 100, height: 100 })
    const crop = useEditorStore.getState().crop!
    expect(crop.x).toBeLessThanOrEqual(1920)
  })

  it('clamps width so x + width <= probe width', () => {
    useEditorStore.getState().setCrop({ x: 1800, y: 0, width: 500, height: 100 })
    const crop = useEditorStore.getState().crop!
    expect(crop.x + crop.width).toBeLessThanOrEqual(1920)
  })

  it('clamps height so y + height <= probe height', () => {
    useEditorStore.getState().setCrop({ x: 0, y: 1000, width: 100, height: 500 })
    const crop = useEditorStore.getState().crop!
    expect(crop.y + crop.height).toBeLessThanOrEqual(1080)
  })

  it('enforces minimum width and height of 1', () => {
    useEditorStore.getState().setCrop({ x: 0, y: 0, width: 0, height: 0 })
    const crop = useEditorStore.getState().crop!
    expect(crop.width).toBeGreaterThanOrEqual(1)
    expect(crop.height).toBeGreaterThanOrEqual(1)
  })

  it('passes through valid crop unchanged', () => {
    const input: CropRegion = { x: 100, y: 100, width: 400, height: 300 }
    useEditorStore.getState().setCrop(input)
    expect(useEditorStore.getState().crop).toEqual(input)
  })
})

describe('setVideoProps / setAudioProps', () => {
  it('merges partial video props', () => {
    useEditorStore.getState().setVideoProps({ crf: 18, preset: 'fast' })
    const vp = useEditorStore.getState().videoProps
    expect(vp.crf).toBe(18)
    expect(vp.preset).toBe('fast')
    expect(vp.codec).toBe('copy') // unchanged default
  })

  it('merges partial audio props', () => {
    useEditorStore.getState().setAudioProps({ bitrate: 320, volume: 0.5 })
    const ap = useEditorStore.getState().audioProps
    expect(ap.bitrate).toBe(320)
    expect(ap.volume).toBe(0.5)
    expect(ap.codec).toBe('copy') // unchanged default
  })
})

describe('setPreviewUrl', () => {
  it('sets preview URL', () => {
    useEditorStore.getState().setPreviewUrl('blob:new')
    expect(useEditorStore.getState().previewUrl).toBe('blob:new')
  })
})

describe('reset', () => {
  it('clears all state back to defaults', () => {
    useEditorStore.getState().loadFile(stubFile, stubProbe)
    useEditorStore.getState().setCrop({ x: 10, y: 10, width: 100, height: 100 })
    useEditorStore.getState().reset()
    expect(useEditorStore.getState().file).toBeNull()
    expect(useEditorStore.getState().probe).toBeNull()
    expect(useEditorStore.getState().totalFrames).toBe(0)
    expect(useEditorStore.getState().selections).toEqual([])
    expect(useEditorStore.getState().crop).toBeNull()
  })
})

