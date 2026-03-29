// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { TransportBar } from '@/components/editor/TransportBar'
import { useEditorStore } from '@/stores/editorStore'
import type { ProbeResult, VideoProps, AudioProps } from '@/types/editor'

const defaultVideoProps: VideoProps = {
  codec: 'copy',
  preset: 'fast',
  crf: 25,
  profile: 'high',
  tune: '',
  width: null,
  height: null,
  fps: null,
  speed: 1,
  trackIndex: 0,
  subtitleTrackIndex: null,
  keepAspectRatio: true,
  preciseFrameCuts: false,
  fastExport: false,
}

const defaultAudioProps: AudioProps = {
  codec: 'copy',
  bitrate: 128,
  volume: 1,
  speed: 1,
  pitch: 0,
  trackIndex: 0,
}

const probe: ProbeResult = {
  duration: 120,
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: 'h264',
  audioCodec: 'aac',
  containerBitrate: 0,
  videoBitrate: 0,
  audioBitrate: 0,
  audioSampleRate: 48000,
  audioChannels: 2,
  videoTracks: [{ index: 0, codec: 'h264', label: 'h264' }],
  audioTracks: [{ index: 1, codec: 'aac', label: 'aac' }],
  subtitleTracks: [],
  format: 'mp4',
}

function seedEditorState() {
  useEditorStore.setState({
    file: {
      name: 'clip.mp4',
      size: 100,
      type: 'video/mp4',
      objectUrl: 'blob:test',
      sourceHandle: null,
    },
    probe,
    previewUrl: null,
    totalFrames: 3600,
    currentFrame: 0,
    keyframes: [],
    ingestionStatus: 'ready',
    selections: [{ id: 'full', start: 0, end: 3599 }],
    crop: null,
    cropMode: false,
    videoProps: { ...defaultVideoProps },
    audioProps: { ...defaultAudioProps },
    outputFormat: 'source',
    activeTab: 'video',
    isExporting: false,
    showFrames: false,
  })
}

function Harness({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) {
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  return <TransportBar videoRef={videoRef} pressedKey={pressedKey} setPressedKey={setPressedKey} />
}

describe('TransportBar hotkey repeat behavior', () => {
  beforeEach(() => {
    seedEditorState()
  })

  it('applies repeated period keydown events while held', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'duration', { value: 120, configurable: true })
    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>

    render(<Harness videoRef={videoRef} />)

    fireEvent.keyDown(window, { key: '.', repeat: true })
    fireEvent.keyDown(window, { key: '.', repeat: true })
    fireEvent.keyDown(window, { key: '.', repeat: true })

    expect(useEditorStore.getState().currentFrame).toBe(3)
  })

  it('applies repeated comma keydown events while held', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'duration', { value: 120, configurable: true })
    video.currentTime = 1
    useEditorStore.getState().setCurrentFrame(30)
    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>

    render(<Harness videoRef={videoRef} />)

    fireEvent.keyDown(window, { key: ',', repeat: true })
    fireEvent.keyDown(window, { key: ',', repeat: true })
    fireEvent.keyDown(window, { key: ',', repeat: true })

    expect(useEditorStore.getState().currentFrame).toBe(27)
  })

  it('applies repeated ArrowRight keydown events while held', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'duration', { value: 120, configurable: true })
    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>

    render(<Harness videoRef={videoRef} />)

    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })
    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })
    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })

    expect(useEditorStore.getState().currentFrame).toBe(450)
  })

  it('applies repeated ArrowLeft keydown events while held', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'duration', { value: 120, configurable: true })
    video.currentTime = 30
    useEditorStore.getState().setCurrentFrame(900)
    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>

    render(<Harness videoRef={videoRef} />)

    fireEvent.keyDown(window, { key: 'ArrowLeft', repeat: true })
    fireEvent.keyDown(window, { key: 'ArrowLeft', repeat: true })

    expect(useEditorStore.getState().currentFrame).toBe(600)
  })

  it('does not force a passive pause frame sync', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'duration', { value: 120, configurable: true })
    video.currentTime = 0.4
    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>

    const { getByText } = render(<Harness videoRef={videoRef} />)
    fireEvent.pause(video)

    expect(useEditorStore.getState().currentFrame).toBe(0)
    expect(getByText('0:00.000 / 2:00.000')).toBeTruthy()
  })

  it('pauses immediately at custom fps without waiting for next visual frame', () => {
    useEditorStore.getState().setVideoProps({ fps: 2 })

    const video = document.createElement('video')
    Object.defineProperty(video, 'duration', { value: 120, configurable: true })
    Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true })
    video.currentTime = 0.2
    const pauseSpy = vi.fn(() => {
      Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true })
    })
    Object.defineProperty(video, 'pause', { value: pauseSpy, configurable: true })
    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>

    render(<Harness videoRef={videoRef} />)

    // Trigger pause path while "playing".
    fireEvent.keyDown(window, { key: ' ' })

    // Pause should happen right away.
    expect(pauseSpy).toHaveBeenCalledTimes(1)
  })
})
