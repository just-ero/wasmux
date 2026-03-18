// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { TransportBar } from '@/components/editor/TransportBar'
import { useEditorStore } from '@/stores/editorStore'
import type { ProbeResult, VideoProps, AudioProps } from '@/types/editor'

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
})
