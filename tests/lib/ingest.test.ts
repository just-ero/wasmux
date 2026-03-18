import { describe, expect, it } from 'vitest'
import { cancelIngest, isIngestionActive, validateProbeForIngest } from '@/lib/ingest'
import type { ProbeResult } from '@/types/editor'
import { useEditorStore } from '@/stores/editorStore'
import { useLogStore } from '@/stores/logStore'

const baseProbe: ProbeResult = {
  duration: 10,
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: 'h264',
  audioCodec: 'aac',
  containerBitrate: 2048,
  videoBitrate: 1800,
  audioBitrate: 128,
  audioSampleRate: 48000,
  audioChannels: 2,
  videoTracks: [{ index: 0, codec: 'h264', label: 'h264' }],
  audioTracks: [{ index: 1, codec: 'aac', label: 'aac' }],
  subtitleTracks: [],
  format: 'mp4',
}

describe('validateProbeForIngest', () => {
  it('accepts probe results with at least one media track and positive duration', () => {
    expect(validateProbeForIngest(baseProbe)).toBeNull()
  })

  it('rejects probe results with no video and no audio streams', () => {
    const probe: ProbeResult = {
      ...baseProbe,
      videoTracks: [],
      audioTracks: [],
    }

    expect(validateProbeForIngest(probe)).toMatch(/no usable video or audio streams/i)
  })

  it('rejects invalid video metadata when a video stream exists', () => {
    const probe: ProbeResult = {
      ...baseProbe,
      width: 0,
      height: 0,
    }

    expect(validateProbeForIngest(probe)).toMatch(/missing dimensions/i)
  })

  it('rejects files with no playable duration', () => {
    const probe: ProbeResult = {
      ...baseProbe,
      duration: 0,
    }

    expect(validateProbeForIngest(probe)).toMatch(/no playable duration/i)
  })

  it('accepts audio-only probes when duration is valid', () => {
    const probe: ProbeResult = {
      ...baseProbe,
      width: 0,
      height: 0,
      fps: 0,
      videoCodec: '',
      videoTracks: [],
      audioTracks: [{ index: 0, codec: 'mp3', label: 'mp3' }],
      audioCodec: 'mp3',
    }

    expect(validateProbeForIngest(probe)).toBeNull()
  })
})

describe('cancelIngest', () => {
  it('removes ingest log root and resets active ingestion status to idle', () => {
    useEditorStore.setState({ ingestionStatus: 'probing' })
    useLogStore.setState({
      entries: [{ id: 'ingest', label: 'ingesting demo.mp4', status: 'running', progress: 50, children: [] }],
    })

    cancelIngest()

    expect(useEditorStore.getState().ingestionStatus).toBe('idle')
    expect(useLogStore.getState().entries.find((e) => e.id === 'ingest')).toBeUndefined()
  })

  it('does not modify non-active ingestion status', () => {
    useEditorStore.setState({ ingestionStatus: 'ready' })
    cancelIngest()
    expect(useEditorStore.getState().ingestionStatus).toBe('ready')
  })
})

describe('isIngestionActive', () => {
  it('returns true only for active ingest phases', () => {
    expect(isIngestionActive('writing')).toBe(true)
    expect(isIngestionActive('probing')).toBe(true)
    expect(isIngestionActive('preview')).toBe(true)
    expect(isIngestionActive('idle')).toBe(false)
    expect(isIngestionActive('ready')).toBe(false)
    expect(isIngestionActive('error')).toBe(false)
  })
})
