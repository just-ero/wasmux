/** top-level editor layout. */

import { useEffect, useRef, useState } from 'react'
import { useLogStore } from '@/stores/logStore'
import { useEditorStore } from '@/stores/editorStore'
import { EditorHeader } from '@/components/editor/EditorHeader'
import { VideoPlayer } from '@/components/editor/VideoPlayer'
import { TransportBar } from '@/components/editor/TransportBar'
import { Timeline } from '@/components/editor/Timeline'
import { CropOverlay } from '@/components/editor/CropOverlay'
import { KeyboardHelp } from '@/components/shared/KeyboardHelp'
import { InfoPanel } from '@/components/shared/InfoPanel'
import { HOTKEYS, matchesHotkey } from '@/lib/hotkeys'
import { isFormElement } from '@/lib/domUtils'
import type { Theme } from '@/hooks/useTheme'

interface Props {
  onClose: () => void
  theme: Theme
  onToggleTheme: () => void
}

export function EditorView({ onClose, theme, onToggleTheme }: Props) {
  const MAX_RESOLUTION = 8192
  const UNLOCKED_STEP_PX = 16
  const videoRef = useRef<HTMLVideoElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const panelHeight = useLogStore((s) => s.panelHeight)
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const setCrop = useEditorStore((s) => s.setCrop)
  const setVideoProps = useEditorStore((s) => s.setVideoProps)
  const probe = useEditorStore((s) => s.probe)
  const previewUrl = useEditorStore((s) => s.previewUrl)
  const videoTrackIndex = useEditorStore((s) => s.videoProps.trackIndex)
  const resolutionWidth = useEditorStore((s) => s.videoProps.width)
  const resolutionHeight = useEditorStore((s) => s.videoProps.height)
  const keepAspectRatio = useEditorStore((s) => s.videoProps.keepAspectRatio)
  const ingestionStatus = useEditorStore((s) => s.ingestionStatus)

  const onPreviewWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!previewUrl || videoTrackIndex === null || !probe) return
    if (e.ctrlKey || e.metaKey) return
    if (isFormElement(e.target)) return

    const sourceW = Math.max(1, probe.width || 1)
    const sourceH = Math.max(1, probe.height || 1)

    const currentW = resolutionWidth !== null && resolutionWidth > 0
      ? Math.max(1, Math.round(resolutionWidth))
      : sourceW
    const currentH = resolutionHeight !== null && resolutionHeight > 0
      ? Math.max(1, Math.round(resolutionHeight))
      : sourceH

    const direction = e.deltaY < 0 ? 1 : -1

    if (keepAspectRatio) {
      // Use source dimensions as the scale baseline so each tick maps to
      // visible factor changes (e.g. 1.00 -> 0.95 at one downward tick).
      const rawScalar = Math.min(currentW / sourceW, currentH / sourceH)
      const currentScalar = Math.round(rawScalar * 100) / 100
      const minScalar = 1 / Math.max(sourceW, sourceH)
      const maxScalar = MAX_RESOLUTION / Math.max(sourceW, sourceH)
      const isOne = Math.abs(currentScalar - 1) < 1e-9
      const isTenth = Math.abs(currentScalar - 0.1) < 1e-9
      const scalarStep = isOne
        ? (direction > 0 ? 0.1 : 0.05)
        : isTenth
          ? (direction > 0 ? 0.05 : 0.01)
          : currentScalar > 1
            ? 0.1
            : currentScalar > 0.1
              ? 0.05
              : 0.01
      const nextScalar = Math.max(
        minScalar,
        Math.min(maxScalar, currentScalar + direction * scalarStep),
      )
      const exactW = Math.max(1, Math.min(MAX_RESOLUTION, Math.round(sourceW * nextScalar)))
      const exactH = Math.max(1, Math.min(MAX_RESOLUTION, Math.round(sourceH * nextScalar)))

      setVideoProps({ width: exactW, height: exactH })
      return
    }

    const delta = direction * UNLOCKED_STEP_PX
    const nextW = Math.max(1, Math.min(MAX_RESOLUTION, currentW + delta))
    const nextH = Math.max(1, Math.min(MAX_RESOLUTION, currentH + delta))
    setVideoProps({ width: nextW, height: nextH })
  }

  // move focus into the editor when it mounts (landing → editor transition)
  useEffect(() => {
    mainRef.current?.focus()
  }, [])

  // global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isFormElement(e.target)) return

      if (matchesHotkey(e.key, HOTKEYS.help) && !helpOpen) {
        e.preventDefault()
        setHelpOpen(true)
        return
      }

      if (matchesHotkey(e.key, HOTKEYS.theme)) {
        e.preventDefault()
        onToggleTheme()
        return
      }

      if (matchesHotkey(e.key, HOTKEYS.createCrop)) {
        // don't trigger with modifiers (ctrl+c, cmd+c, etc)
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
        // only trigger if video track is selected
        if (!probe || probe.videoTracks.length === 0) return
        const state = useEditorStore.getState()
        if (state.videoProps.trackIndex === null) return

        e.preventDefault()
        // create a default crop at center (50% of video size at center)
        if (probe && probe.width > 0 && probe.height > 0) {
          const cropSize = Math.min(probe.width, probe.height) * 0.5
          const x = (probe.width - cropSize) / 2
          const y = (probe.height - cropSize) / 2
          setCrop({ x: Math.round(x), y: Math.round(y), width: Math.round(cropSize), height: Math.round(cropSize) })
        }
        return
      }

      if (matchesHotkey(e.key, HOTKEYS.export)) {
        e.preventDefault()
        // trigger export button click
        const exportButton = document.querySelector('button[aria-label*="Export"], button:has(svg[aria-label*="Export"])')
        if (exportButton && exportButton instanceof HTMLButtonElement) {
          exportButton.click()
        }
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [helpOpen, onToggleTheme, probe, setCrop])

  return (
    <div
      ref={mainRef}
      id="editor-main"
      tabIndex={-1}
      className="flex flex-col h-dvh outline-none"
      style={{ paddingBottom: `${panelHeight}px` }}
    >
      <EditorHeader
        onClose={onClose}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onShowHelp={() => setHelpOpen(true)}
        onShowInfo={() => setInfoOpen(true)}
      />

      {/* video area with crop overlay */}
      <div className="relative flex-1 flex min-h-0" onWheel={onPreviewWheel} title="Scroll to zoom output resolution preview">
        <VideoPlayer videoRef={videoRef} />
        <CropOverlay videoRef={videoRef} />
      </div>

      {/* bottom controls - the panel overlays these when opened */}
      {ingestionStatus === 'ready' && (
        <div className="shrink-0 relative">
          <TransportBar videoRef={videoRef} pressedKey={pressedKey} setPressedKey={setPressedKey} />
          <Timeline videoRef={videoRef} pressedKey={pressedKey} />
        </div>
      )}

      {/* keyboard help modal */}
      <KeyboardHelp isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <InfoPanel isOpen={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  )
}
