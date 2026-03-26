/** top-level editor layout. */

import { useEffect, useRef, useState } from 'react'
import { useLogStore } from '../../stores/logStore'
import { useEditorStore } from '../../stores/editorStore'
import { EditorHeader } from './EditorHeader'
import { VideoPlayer } from './VideoPlayer'
import { TransportBar } from './TransportBar'
import { Timeline } from './Timeline'
import { CropOverlay } from './CropOverlay'
import { KeyboardHelp } from '../shared/KeyboardHelp'
import { HOTKEYS, matchesHotkey } from '../../lib/hotkeys'
import { isFormElement } from '../../lib/domUtils'
import type { Theme } from '../../hooks/useTheme'

interface Props {
  onClose: () => void
  theme: Theme
  onToggleTheme: () => void
}

export function EditorView({ onClose, theme, onToggleTheme }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const panelHeight = useLogStore((s) => s.panelHeight)
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const setCrop = useEditorStore((s) => s.setCrop)
  const probe = useEditorStore((s) => s.probe)

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
      <EditorHeader onClose={onClose} theme={theme} onToggleTheme={onToggleTheme} onShowHelp={() => setHelpOpen(true)} />

      {/* video area with crop overlay */}
      <div className="relative flex-1 flex min-h-0">
        <VideoPlayer videoRef={videoRef} />
        <CropOverlay videoRef={videoRef} />
      </div>

      {/* bottom controls - the panel overlays these when opened */}
      <div className="shrink-0 relative">
        <TransportBar videoRef={videoRef} pressedKey={pressedKey} setPressedKey={setPressedKey} />
        <Timeline videoRef={videoRef} pressedKey={pressedKey} />
      </div>

      {/* keyboard help modal */}
      <KeyboardHelp isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
