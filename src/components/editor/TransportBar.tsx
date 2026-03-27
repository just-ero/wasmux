/** playback controls and timeline hotkeys. */

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { formatTime, formatFramePadded, frameToTime, clampFrame, timeToFrameFloor, remapFrameIndex, snapFrameToFpsGrid, totalFramesFromDuration } from '@/lib/frameUtils'
import { isFormElement, tryPlay } from '@/lib/domUtils'
import { HOTKEYS, matchesHotkey } from '@/lib/hotkeys'
import * as Icons from '@/components/shared/Icons'
import { ExportControls } from '@/components/editor/ExportControls'

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>
  pressedKey: string | null
  setPressedKey: React.Dispatch<React.SetStateAction<string | null>>
}

export const TransportBar = memo(function TransportBar({ videoRef, pressedKey, setPressedKey }: Props) {
  const currentFrame = useEditorStore((s) => s.currentFrame)
  const totalFrames = useEditorStore((s) => s.totalFrames)
  const probe = useEditorStore((s) => s.probe)
  const setSelections = useEditorStore((s) => s.setSelections)
  const setInPoint = useEditorStore((s) => s.setInPoint)
  const setOutPoint = useEditorStore((s) => s.setOutPoint)
  const showFrames = useEditorStore((s) => s.showFrames)
  const setShowFrames = useEditorStore((s) => s.setShowFrames)
  const outputFpsOverride = useEditorStore((s) => s.videoProps.fps)
  const fps = probe?.fps ?? 0
  const displayFps = outputFpsOverride && outputFpsOverride > 0 ? outputFpsOverride : fps
  const duration = probe?.duration ?? 0
  const displayTotalFrames = displayFps > 0 && duration > 0
    ? totalFramesFromDuration(duration, displayFps)
    : totalFrames
  const currentFrameDisplay = remapFrameIndex(currentFrame, fps, displayFps, displayTotalFrames)

  const [playing, setPlaying] = useState(false)
  const rafRef = useRef<number>(0)
  const previewUrl = useEditorStore((s) => s.previewUrl)

  const syncPausedFrameToGrid = useCallback(() => {
    const video = videoRef.current
    if (!video || fps <= 0) return

    // Keep paused playhead values representable in the active display fps domain.
    const sourceFrame = timeToFrameFloor(video.currentTime, fps)
    const snappedSourceFrame = snapFrameToFpsGrid(sourceFrame, fps, displayFps, totalFrames)
    if (snappedSourceFrame !== sourceFrame) {
      video.currentTime = frameToTime(snappedSourceFrame, fps)
    }
    useEditorStore.getState().setCurrentFrame(snappedSourceFrame)
  }, [videoRef, fps, displayFps, totalFrames])

  // raf loop for smooth time sync during playback
  // re-runs when previewurl changes because that's when the <video> actually mounts.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let active = false
    const tick = () => {
      if (!active) return
      const f = fps > 0 ? timeToFrameFloor(video.currentTime, fps) : 0
      useEditorStore.getState().setCurrentFrame(f)
      rafRef.current = requestAnimationFrame(tick)
    }

    const onPlay = () => { setPlaying(true); active = true; tick() }
    const onPlaying = () => { setPlaying(true); if (!active) { active = true; tick() } }
    const onPause = () => {
      setPlaying(false)
      active = false
      cancelAnimationFrame(rafRef.current)
      syncPausedFrameToGrid()
    }
    const onEnded = () => { setPlaying(false); active = false; cancelAnimationFrame(rafRef.current) }
    const onSeeked = () => {
      if (video.paused && fps > 0) {
        syncPausedFrameToGrid()
      }
    }
    const onTimeUpdate = () => {
      if (fps > 0) {
        useEditorStore.getState().setCurrentFrame(timeToFrameFloor(video.currentTime, fps))
      }
    }

    // sync initial state
    setPlaying(!video.paused)

    video.addEventListener('play', onPlay)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('timeupdate', onTimeUpdate)
    return () => {
      active = false
      cancelAnimationFrame(rafRef.current)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [videoRef, fps, previewUrl, syncPausedFrameToGrid])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) tryPlay(video)
    else video.pause()
  }, [videoRef])

  const stepFrame = useCallback((delta: number) => {
    const video = videoRef.current
    if (!video || fps <= 0) return
    video.pause()
    let nextSourceFrame: number
    if (displayFps > 0 && Math.abs(displayFps - fps) > 1e-9) {
      const currentDisplayFrame = remapFrameIndex(currentFrame, fps, displayFps, displayTotalFrames)
      const nextDisplayFrame = clampFrame(currentDisplayFrame + delta, displayTotalFrames)
      nextSourceFrame = remapFrameIndex(nextDisplayFrame, displayFps, fps, totalFrames)
    } else {
      nextSourceFrame = clampFrame(currentFrame + delta, totalFrames)
    }
    video.currentTime = frameToTime(nextSourceFrame, fps)
    useEditorStore.getState().setCurrentFrame(nextSourceFrame)
  }, [videoRef, fps, currentFrame, totalFrames, displayFps, displayTotalFrames])

  const skipTime = useCallback((seconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds))
    if (fps > 0) {
      useEditorStore.getState().setCurrentFrame(timeToFrameFloor(video.currentTime, fps))
    }
  }, [videoRef, fps])

  /** set start/end selection, auto-swapping if needed. */
  const setIn = useCallback(() => {
    setInPoint(currentFrame)
  }, [currentFrame, setInPoint])

  const setOut = useCallback(() => {
    setOutPoint(currentFrame)
  }, [currentFrame, setOutPoint])

  const clearSelection = useCallback(() => {
    setSelections([{ id: 'full', start: 0, end: Math.max(0, totalFrames - 1) }])
  }, [setSelections, totalFrames])

  // global hotkeys
  useEffect(() => {
    const repeatableHotkeys = new Set<string>([
      HOTKEYS.prevFrame[0],
      HOTKEYS.nextFrame[0],
      HOTKEYS.skipBack[0],
      HOTKEYS.skipForward[0],
    ])

    const onKeyDown = (e: KeyboardEvent) => {
      if (isFormElement(e.target)) return
      // Allow frame stepping hotkeys even when video has focus, but block other hotkeys from video
      const isVideoTarget = e.target instanceof HTMLVideoElement
      const isFrameSteppingKey = e.key === HOTKEYS.prevFrame[0] || e.key === HOTKEYS.nextFrame[0]
      if (isVideoTarget && !isFrameSteppingKey) return
      if (e.repeat && !repeatableHotkeys.has(e.key)) return

      switch (e.key) {
        case HOTKEYS.playPause[0]:
          e.preventDefault()
          setPressedKey('space')
          togglePlay()
          break
        case HOTKEYS.prevFrame[0]:
          e.preventDefault()
          setPressedKey(',')
          stepFrame(-1)
          break
        case HOTKEYS.nextFrame[0]:
          e.preventDefault()
          setPressedKey('.')
          stepFrame(1)
          break
        case HOTKEYS.skipBack[0]:
          e.preventDefault()
          skipTime(-5)
          break
        case HOTKEYS.skipForward[0]:
          e.preventDefault()
          skipTime(5)
          break
        default:
          if (matchesHotkey(e.key, HOTKEYS.setIn)) {
            e.preventDefault()
            setPressedKey('[')
            setIn()
          } else if (matchesHotkey(e.key, HOTKEYS.setOut)) {
            e.preventDefault()
            setPressedKey(']')
            setOut()
          } else if (matchesHotkey(e.key, HOTKEYS.clearSelection)) {
            e.preventDefault()
            clearSelection()
          }
          break
      }
    }
    const onKeyUp = () => setPressedKey(null)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [togglePlay, stepFrame, skipTime, setIn, setOut, clearSelection])

  // format display
  const currentSeconds = fps > 0 ? currentFrame / fps : 0
  const currentFrameDisplayOne = displayTotalFrames > 0 ? currentFrameDisplay + 1 : 0
  const timeText = showFrames
    ? `${formatFramePadded(currentFrameDisplayOne, displayTotalFrames)} / ${formatFramePadded(displayTotalFrames, displayTotalFrames)}`
    : `${formatTime(currentSeconds, duration)} / ${formatTime(duration, duration)}`

  return (
    <>
      <div className="control-row grid grid-cols-[1fr_auto_1fr] items-center bg-bg-raised border-t border-border shrink-0">
      {/* time display - plain text, selectable, click toggles frames */}
      <span
        role="button"
        tabIndex={0}
        onClick={() => {
          const selected = window.getSelection()?.toString() ?? ''
          if (selected.trim()) return
          setShowFrames(!showFrames)
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowFrames(!showFrames) } }}
        className="tabular-nums select-text whitespace-pre text-text-muted justify-self-start"
        aria-label={showFrames ? 'Showing frames, click for time' : 'Showing time, click for frames'}
        aria-pressed={showFrames}
      >
        {timeText}
      </span>

      {/* transport buttons - truly centered on page */}
      <div className="flex items-center" style={{ gap: 'var(--wasmux-control-gap)' }}>
        <button
          onClick={() => stepFrame(-1)}
          className="btn"
          data-pressed={pressedKey === ',' || undefined}
          aria-label="Previous frame (,)"
          title="Previous frame (,)"
        >
          <Icons.Chevron width={16} height={16} />
        </button>

        <button
          onClick={togglePlay}
          className="btn"
          data-pressed={pressedKey === 'space' || undefined}
          aria-label={playing ? 'Pause (Space)' : 'Play (Space)'}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
        >
          {playing ? <Icons.Pause width={16} height={16} /> : <Icons.Play width={16} height={16} />}
        </button>

        <button
          onClick={() => stepFrame(1)}
          className="btn"
          data-pressed={pressedKey === '.' || undefined}
          aria-label="Next frame (.)"
          title="Next frame (.)"
        >
          <Icons.ChevronRight width={16} height={16} />
        </button>
      </div>

      <div className="justify-self-end" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <ExportControls />
      </div>
      </div>
    </>
  )
})
