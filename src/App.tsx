/** root app shell for landing and editor views. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { useGlobalDrop } from '@/hooks/useGlobalDrop'
import { isFormElement } from '@/lib/domUtils'
import { startFFmpegLoad } from '@/hooks/useFFmpeg'
import { useEditorStore } from '@/stores/editorStore'
import { useLogStore } from '@/stores/logStore'
import { useFFmpegStore } from '@/stores/ffmpegStore'
import { ingestFile } from '@/lib/ingest'
import { cancelIngest, isIngestionActive } from '@/lib/ingest'
import { LandingPage } from '@/components/landing/LandingPage'
import { DragOverlay } from '@/components/landing/DragOverlay'
import { LogPanel } from '@/components/shared/LogPanel'
import { EditorView } from '@/components/editor/EditorView'
import { BrowseInput } from '@/components/landing/DropZone'
import type { BrowseInputHandle } from '@/components/landing/DropZone'
import type { NativeFileHandle } from '@/types/editor'
import { startMemoryTelemetry } from '@/stores/memoryTelemetryStore'
import { useRuntimeConfigStore } from '@/stores/runtimeConfigStore'

export function App() {
  useEffect(() => {
    startMemoryTelemetry()
    void useRuntimeConfigStore.getState().loadRuntimeConfig()
  }, [])

  const { theme, toggle } = useTheme()
  const file = useEditorStore((s) => s.file)
  const ingestionStatus = useEditorStore((s) => s.ingestionStatus)
  const ffmpegStatus = useFFmpegStore((s) => s.status)

  // validation error shown on landing view. cleared on next successful file.
  const [error, setError] = useState<string | null>(null)

  const loadFile = useEditorStore((s) => s.loadFile)
  const reset = useEditorStore((s) => s.reset)
  const pendingFileRef = useRef<{ file: File; sourceHandle: NativeFileHandle | null } | null>(null)

  const resetToLanding = useCallback(() => {
    cancelIngest()
    pendingFileRef.current = null

    const prev = useEditorStore.getState().file
    if (prev) URL.revokeObjectURL(prev.objectUrl)

    // clear file-scoped logs when returning to landing
    const logState = useLogStore.getState()
    const fileScopedEntries = logState.entries.filter(
      (e) => e.id === 'ingest' || e.id.startsWith('ingest-') || e.id.startsWith('export-'),
    )
    fileScopedEntries.forEach((e) => logState.removeEntry(e.id))

    reset()
  }, [reset])

  const beginIngest = useCallback((f: File, sourceHandle?: NativeFileHandle | null) => {
    setError(null)

    // revoke previous object url to avoid leaks.
    const prev = useEditorStore.getState().file
    if (prev) URL.revokeObjectURL(prev.objectUrl)

    const objectUrl = URL.createObjectURL(f)

    // set a placeholder in the store so we switch to editor view immediately
    loadFile(
      { name: f.name, size: f.size, type: f.type, objectUrl, sourceHandle: sourceHandle ?? null },
      { duration: 0, width: 0, height: 0, fps: 0, videoCodec: '', audioCodec: '',
        containerBitrate: 0,
        videoBitrate: 0, audioBitrate: 0, audioSampleRate: 0, audioChannels: 0,
        videoTracks: [], audioTracks: [], subtitleTracks: [], format: '' },
    )
    void ingestFile(f, objectUrl, sourceHandle ?? null).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      resetToLanding()
      setError(message)
    })
  }, [loadFile, resetToLanding])

  /** start ingestion when a file is selected. */
  const handleFile = useCallback((f: File, sourceHandle?: NativeFileHandle | null) => {
    const ffStatus = useFFmpegStore.getState().status
    if (ffStatus !== 'ready') {
      pendingFileRef.current = { file: f, sourceHandle: sourceHandle ?? null }
      const prev = useEditorStore.getState().file
      if (prev) URL.revokeObjectURL(prev.objectUrl)

      const objectUrl = URL.createObjectURL(f)
      loadFile(
        { name: f.name, size: f.size, type: f.type, objectUrl, sourceHandle: sourceHandle ?? null },
        {
          duration: 0,
          width: 0,
          height: 0,
          fps: 0,
          videoCodec: '',
          audioCodec: '',
          containerBitrate: 0,
          videoBitrate: 0,
          audioBitrate: 0,
          audioSampleRate: 0,
          audioChannels: 0,
          videoTracks: [],
          audioTracks: [],
          subtitleTracks: [],
          format: '',
        },
      )
      useEditorStore.getState().setIngestionStatus('preview')
      if (ffStatus === 'idle') void startFFmpegLoad()
      setError(null)
      return
    }

    beginIngest(f, sourceHandle ?? null)
  }, [beginIngest])

  /** handle validation errors from drop, paste, or browse. */
  const handleError = useCallback((msg: string) => {
    setError(msg)
  }, [])

  // global drag-and-drop and paste listeners.
  const { isDragging } = useGlobalDrop({
    onFile: handleFile,
    onError: handleError,
  })

  useEffect(() => {
    if (ffmpegStatus !== 'ready') return

    const pending = pendingFileRef.current
    if (!pending) {
      setError(null)
      return
    }

    pendingFileRef.current = null
    beginIngest(pending.file, pending.sourceHandle)
  }, [beginIngest, ffmpegStatus])

  // hidden file input ref used to open the os picker.
  const browseRef = useRef<BrowseInputHandle>(null)

  // global hotkey: t toggles theme unless focus is in a form field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 't' &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !isFormElement(e.target)
      ) {
        toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  const onBrowseClick = useCallback(() => {
    if (useFFmpegStore.getState().status === 'idle') void startFFmpegLoad()
    browseRef.current?.browse()
  }, [])

  /** close editor and return to landing page. */
  const handleClose = useCallback(() => {
    resetToLanding()
  }, [resetToLanding])

  useEffect(() => {
    if (!file) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (!isIngestionActive(useEditorStore.getState().ingestionStatus)) return
      e.preventDefault()
      handleClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [file, ingestionStatus, handleClose])

  if (file) {
    return (
      <>
        <a href="#editor-main" className="skip-link">Skip to editor</a>
        <BrowseInput ref={browseRef} onFile={handleFile} onError={handleError} />
        <DragOverlay visible={isDragging} />
        <LogPanel />
        <EditorView onClose={handleClose} theme={theme} onToggleTheme={toggle} />
      </>
    )
  }

  return (
    <>
      {/* hidden file input */}
      <a href="#landing-main" className="skip-link">Skip to content</a>
      <BrowseInput ref={browseRef} onFile={handleFile} onError={handleError} />

      {/* full-screen drag overlay */}
      <DragOverlay visible={isDragging} />

      {/* bottom operation log panel */}
      <LogPanel />

      {/* normal landing page; only explicit browse action opens picker. */}
      <main
        id="landing-main"
        className="min-h-dvh flex flex-col"
      >
        <LandingPage
          theme={theme}
          onToggleTheme={toggle}
          onBrowse={onBrowseClick}
          error={error}
        />
      </main>
    </>
  )
}
