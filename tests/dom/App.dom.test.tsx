// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { forwardRef, useImperativeHandle } from 'react'
import { App } from '@/App'
import { useEditorStore } from '@/stores/editorStore'
import { useLogStore } from '@/stores/logStore'

vi.mock('../../src/hooks/useFFmpeg', () => ({
  useFFmpeg: () => {},
}))

vi.mock('../../src/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggle: vi.fn() }),
}))

vi.mock('../../src/hooks/useGlobalDrop', () => ({
  useGlobalDrop: () => ({ isDragging: false }),
}))

vi.mock('../../src/components/landing/LandingPage', () => ({
  LandingPage: () => <div>landing</div>,
}))

vi.mock('../../src/components/landing/DragOverlay', () => ({
  DragOverlay: () => null,
}))

vi.mock('../../src/components/shared/LogPanel', () => ({
  LogPanel: () => null,
}))

vi.mock('../../src/components/landing/DropZone', () => ({
  BrowseInput: forwardRef(function MockBrowseInput(_props, ref) {
    useImperativeHandle(ref, () => ({ browse: () => {} }))
    return null
  }),
}))

vi.mock('../../src/components/editor/EditorView', () => ({
  EditorView: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose} aria-label="Close editor">close</button>
  ),
}))

const defaultVideoProps = {
  codec: 'copy' as const,
  preset: 'fast' as const,
  crf: 25,
  profile: 'high' as const,
  tune: '' as const,
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

const defaultAudioProps = {
  codec: 'copy' as const,
  bitrate: 128,
  volume: 1,
  speed: 1,
  pitch: 0,
  trackIndex: 0,
}

function resetEditorStore() {
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
    videoProps: { ...defaultVideoProps, fastExport: false },
    audioProps: { ...defaultAudioProps },
    outputFormat: 'source',
    activeTab: 'video',
    isExporting: false,
    showFrames: false,
  })
}

function seedLoadedFile(ingestionStatus: 'probing' | 'ready') {
  useEditorStore.setState({
    file: {
      name: 'input.mp4',
      size: 100,
      type: 'video/mp4',
      objectUrl: 'blob:test',
      sourceHandle: null,
    },
    ingestionStatus,
  })

  useLogStore.setState({
    entries: [{ id: 'ingest', label: 'ingesting input.mp4', status: 'running', progress: 20, children: [] }],
    panelHeight: 28,
    collapsedIds: new Set(),
  })
}

describe('App ingest cancellation hotkey behavior', () => {
  beforeEach(() => {
    resetEditorStore()
    useLogStore.setState({ entries: [], panelHeight: 28, collapsedIds: new Set() })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('cancels and closes on Escape during active ingest', () => {
    seedLoadedFile('probing')

    render(<App />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(useEditorStore.getState().file).toBeNull()
    expect(useLogStore.getState().entries.find((e) => e.id === 'ingest')).toBeUndefined()
  })

  it('does not close when Escape is pressed after ingest is ready', () => {
    seedLoadedFile('ready')

    render(<App />)
    expect(screen.getByRole('button', { name: 'Close editor' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(useEditorStore.getState().file?.name).toBe('input.mp4')
  })

  it('cancels and closes when close/back is clicked during active ingest', () => {
    seedLoadedFile('probing')

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }))

    expect(useEditorStore.getState().file).toBeNull()
    expect(useLogStore.getState().entries.find((e) => e.id === 'ingest')).toBeUndefined()
  })
})
