// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { VideoPlayer } from '@/components/editor/VideoPlayer'
import { useEditorStore } from '@/stores/editorStore'

describe('VideoPlayer loading layout stability', () => {
  it('keeps loading dots container fixed width to avoid layout shift', () => {
    useEditorStore.setState({
      previewUrl: null,
      ingestionStatus: 'writing',
      videoProps: {
        ...useEditorStore.getState().videoProps,
        trackIndex: 0,
      },
      probe: {
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
      },
    })

    const { container } = render(<VideoPlayer videoRef={createRef<HTMLVideoElement>()} />)

    expect(screen.getByText('preparing preview')).toBeTruthy()
    const dots = container.querySelector('span.inline-block.min-w-\\[3ch\\].text-left')
    expect(dots).not.toBeNull()
  })
})
