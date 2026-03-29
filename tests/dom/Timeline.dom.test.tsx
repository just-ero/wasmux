// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { Timeline } from '@/components/editor/Timeline'
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
    previewUrl: 'blob:preview',
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

function TimelineWithTransport({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) {
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  return (
    <>
      <Timeline videoRef={videoRef} pressedKey={pressedKey} />
      <TransportBar videoRef={videoRef} pressedKey={pressedKey} setPressedKey={setPressedKey} />
    </>
  )
}

describe('Timeline drag scrubbing', () => {
  beforeEach(() => {
    seedEditorState()
  })

  it('sets video currentTime immediately on seek drag', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'duration', { value: 120, configurable: true })
    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>

    const { getByRole } = render(<Timeline videoRef={videoRef} pressedKey={null} />)
    const slider = getByRole('slider', { name: 'Timeline' })
    ;(slider as HTMLDivElement).setPointerCapture = vi.fn()

    const bar = slider.querySelector('.bg-bg-sunken') as HTMLDivElement
    bar.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      top: 0,
      right: 100,
      bottom: 20,
      left: 0,
      toJSON: () => ({}),
    })

    fireEvent.pointerDown(slider, { pointerId: 1, pointerType: 'mouse', clientX: 50 })

    expect(video.currentTime).toBeCloseTo(60, 1)
    expect(useEditorStore.getState().currentFrame).toBe(1800)
  })

  it('updates currentTime while pointer moves during drag', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'duration', { value: 120, configurable: true })
    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>

    const { getByRole } = render(<Timeline videoRef={videoRef} pressedKey={null} />)
    const slider = getByRole('slider', { name: 'Timeline' })
    ;(slider as HTMLDivElement).setPointerCapture = vi.fn()

    const bar = slider.querySelector('.bg-bg-sunken') as HTMLDivElement
    bar.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      top: 0,
      right: 100,
      bottom: 20,
      left: 0,
      toJSON: () => ({}),
    })

    fireEvent.pointerDown(slider, { pointerId: 1, pointerType: 'mouse', clientX: 10 })
    fireEvent.pointerMove(slider, { pointerId: 1, pointerType: 'mouse', clientX: 75 })

    expect(video.currentTime).toBeCloseTo(90, 1)
    expect(useEditorStore.getState().currentFrame).toBe(2699)
  })

  it('moves anchor without previewing frame or moving playhead', () => {
    useEditorStore.setState({
      currentFrame: 1200,
      selections: [{ id: 'full', start: 300, end: 3500 }],
    })

    const video = document.createElement('video')
    Object.defineProperty(video, 'duration', { value: 120, configurable: true })
    video.currentTime = 40
    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>

    const { getByRole } = render(<Timeline videoRef={videoRef} pressedKey={null} />)
    const slider = getByRole('slider', { name: 'Timeline' })
    ;(slider as HTMLDivElement).setPointerCapture = vi.fn()

    const bar = slider.querySelector('.bg-bg-sunken') as HTMLDivElement
    bar.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      top: 0,
      right: 100,
      bottom: 20,
      left: 0,
      toJSON: () => ({}),
    })

    // Grab the in-handle and move it right.
    fireEvent.pointerDown(slider, { pointerId: 1, pointerType: 'mouse', clientX: 8 })
    fireEvent.pointerMove(slider, { pointerId: 1, pointerType: 'mouse', clientX: 20 })

    const midDragState = useEditorStore.getState()
    expect(midDragState.currentFrame).toBe(1200)
    expect(video.currentTime).toBeCloseTo(40, 1) // playhead doesn't move during anchor drag
    expect(midDragState.selections[0].start).toBeGreaterThan(300)
    expect(midDragState.selections[0].end).toBe(3500)

    fireEvent.pointerUp(slider, { pointerId: 1, pointerType: 'mouse', clientX: 20 })

    const finalState = useEditorStore.getState()
    expect(finalState.currentFrame).toBe(1200)
    expect(video.currentTime).toBeCloseTo(40, 1) // playhead still doesn't move after anchor drag
  })

  it('keeps playhead fixed when TransportBar receives seeked during anchor preview', () => {
    useEditorStore.setState({
      currentFrame: 1200,
      selections: [{ id: 'full', start: 300, end: 3500 }],
    })

    const video = document.createElement('video')
    Object.defineProperty(video, 'duration', { value: 120, configurable: true })
    video.currentTime = 40
    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>

    const { getByRole } = render(<TimelineWithTransport videoRef={videoRef} />)
    const slider = getByRole('slider', { name: 'Timeline' })
    ;(slider as HTMLDivElement).setPointerCapture = vi.fn()

    const bar = slider.querySelector('.bg-bg-sunken') as HTMLDivElement
    bar.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      top: 0,
      right: 100,
      bottom: 20,
      left: 0,
      toJSON: () => ({}),
    })

    fireEvent.pointerDown(slider, { pointerId: 1, pointerType: 'mouse', clientX: 8 })
    fireEvent.pointerMove(slider, { pointerId: 1, pointerType: 'mouse', clientX: 20 })
    fireEvent.seeked(video)

    expect(useEditorStore.getState().currentFrame).toBe(1200)

    fireEvent.pointerUp(slider, { pointerId: 1, pointerType: 'mouse', clientX: 20 })
    fireEvent.seeked(video)

    expect(useEditorStore.getState().currentFrame).toBe(1200)
  })

  it('keeps playhead frame-locked during seek drag even if seeked fires', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'duration', { value: 120, configurable: true })
    video.currentTime = 0
    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>

    const { getByRole } = render(<TimelineWithTransport videoRef={videoRef} />)
    const slider = getByRole('slider', { name: 'Timeline' })
    ;(slider as HTMLDivElement).setPointerCapture = vi.fn()

    const bar = slider.querySelector('.bg-bg-sunken') as HTMLDivElement
    bar.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      top: 0,
      right: 100,
      bottom: 20,
      left: 0,
      toJSON: () => ({}),
    })

    fireEvent.pointerDown(slider, { pointerId: 1, pointerType: 'mouse', clientX: 50 })
    expect(useEditorStore.getState().currentFrame).toBe(1800)

    // Simulate decoder landing slightly off frame while dragging.
    video.currentTime = 59.73
    fireEvent.seeked(video)
    expect(useEditorStore.getState().currentFrame).toBe(1800)

    fireEvent.pointerMove(slider, { pointerId: 1, pointerType: 'mouse', clientX: 75 })
    expect(useEditorStore.getState().currentFrame).toBe(2699)

    video.currentTime = 89.55
    fireEvent.seeked(video)
    expect(useEditorStore.getState().currentFrame).toBe(2699)

    fireEvent.pointerUp(slider, { pointerId: 1, pointerType: 'mouse', clientX: 75 })
    fireEvent.seeked(video)
    expect(useEditorStore.getState().currentFrame).toBe(2699)
  })
})
