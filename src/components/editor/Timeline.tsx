/** timeline ribbon for seek and trim. */

import { memo, useCallback, useRef, useState } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { clampFrame, formatTime, frameToTime } from '@/lib/frameUtils'
import { snap } from '@/lib/snap'
import { TrimRibbonVisual } from '@/components/editor/TrimRibbonVisual'

type DragTarget = 'seek' | 'in' | 'out' | null

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>
  pressedKey: string | null
}

export const Timeline = memo(function Timeline({ videoRef, pressedKey }: Props) {
  const totalFrames = useEditorStore((s) => s.totalFrames)
  const currentFrame = useEditorStore((s) => s.currentFrame)
  const showFrames = useEditorStore((s) => s.showFrames)
  const selections = useEditorStore((s) => s.selections)
  const keyframes = useEditorStore((s) => s.keyframes)
  const setSelections = useEditorStore((s) => s.setSelections)
  const setInPoint = useEditorStore((s) => s.setInPoint)
  const setOutPoint = useEditorStore((s) => s.setOutPoint)
  const setSuppressVideoFrameSync = useEditorStore((s) => s.setSuppressVideoFrameSync)
  const setSeekDragActive = useEditorStore((s) => s.setSeekDragActive)
  const probe = useEditorStore((s) => s.probe)
  const fps = probe?.fps ?? 0
  const duration = probe?.duration ?? 0

  const barRef = useRef<HTMLDivElement>(null)
  const [dragTarget, setDragTarget] = useState<DragTarget>(null)

  const sel = selections[0]
  const inFrame = sel?.start ?? 0
  const outFrame = sel?.end ?? Math.max(0, totalFrames - 1)

  const SNAP_PX = 6
  const EDGE_HIT_PX = 10
  const HANDLE_WIDTH_PX = 4
  const pxToFrame = useCallback((clientX: number): number => {
    const bar = barRef.current
    if (!bar) return 0
    const { totalFrames } = useEditorStore.getState()
    if (totalFrames <= 0) return 0
    const rect = bar.getBoundingClientRect()
    if (rect.width <= 0) return 0
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return clampFrame(Math.round(ratio * (totalFrames - 1)), totalFrames)
  }, [])

  const snapSeekFrameToAnchors = useCallback((frame: number): number => {
    const bar = barRef.current
    if (!bar) return frame
    const { totalFrames, selections } = useEditorStore.getState()
    if (totalFrames <= 1) return frame

    const sel = selections[0]
    const inFrame = sel?.start ?? 0
    const outFrame = sel?.end ?? Math.max(0, totalFrames - 1)
    const w = bar.getBoundingClientRect().width
    if (w <= 0) return frame

    const toX = (f: number) => (f / (totalFrames - 1)) * w
    const frameX = toX(frame)
    const inX = toX(inFrame)
    const outX = toX(outFrame)

    if (snap(frameX, inX, SNAP_PX) === inX) return inFrame
    if (snap(frameX, outX, SNAP_PX) === outX) return outFrame
    return frame
  }, [])

  const seek = useCallback((frame: number) => {
    const video = videoRef.current
    if (!video) return
    const { probe } = useEditorStore.getState()
    const fps = probe?.fps ?? 0
    if (fps <= 0) return
    const maxSecs = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Number.MAX_SAFE_INTEGER
    useEditorStore.getState().setCurrentFrame(frame)
    video.currentTime = Math.max(0, Math.min(frame / fps, maxSecs))
  }, [videoRef])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    e.preventDefault()
    const bar = barRef.current
    if (!bar) return
    e.currentTarget.setPointerCapture(e.pointerId)

    const { selections, totalFrames } = useEditorStore.getState()
    const sel = selections[0]
    const inFrame = sel?.start ?? 0
    const outFrame = sel?.end ?? Math.max(0, totalFrames - 1)

    const rect = bar.getBoundingClientRect()
    const toX = (f: number) => (f / Math.max(1, totalFrames - 1)) * rect.width + rect.left
    if (Math.abs(e.clientX - toX(inFrame)) < EDGE_HIT_PX) {
      setDragTarget('in')
    } else if (Math.abs(e.clientX - toX(outFrame)) < EDGE_HIT_PX) {
      setDragTarget('out')
    } else {
      setSuppressVideoFrameSync(true)
      setSeekDragActive(true)
      setDragTarget('seek')
      const video = videoRef.current
      if (video && !video.paused) video.pause()
      seek(snapSeekFrameToAnchors(pxToFrame(e.clientX)))
    }
  }, [seek, pxToFrame, videoRef, setSuppressVideoFrameSync, setSeekDragActive, snapSeekFrameToAnchors])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || !dragTarget) return
    if (dragTarget === 'seek') {
      seek(snapSeekFrameToAnchors(pxToFrame(e.clientX)))
      return
    }
    // dragging in/out handle: snap to playhead
    const frame = pxToFrame(e.clientX)
    const bar = barRef.current
    let snapped = frame
    if (bar) {
      const { totalFrames, currentFrame, selections } = useEditorStore.getState()
      const sel = selections[0]
      const inFrame = sel?.start ?? 0
      const outFrame = sel?.end ?? Math.max(0, totalFrames - 1)
      if (totalFrames > 1) {
        const w = bar.getBoundingClientRect().width
        const fX = (frame / (totalFrames - 1)) * w
        const phX = (currentFrame / (totalFrames - 1)) * w
        if (snap(fX, phX, SNAP_PX) === phX) snapped = currentFrame
      }
      if (dragTarget === 'in') {
        setSelections([{ id: 'full', start: Math.min(snapped, outFrame), end: outFrame }])
      } else {
        setSelections([{ id: 'full', start: inFrame, end: Math.max(snapped, inFrame) }])
      }
    }
  }, [dragTarget, seek, pxToFrame, setSelections, snapSeekFrameToAnchors])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (dragTarget === 'seek') {
      // mark drag as ended but keep suppressVideoFrameSync true so onSeeked
      // in TransportBar can absorb the first post-drag seeked event before clearing it.
      setSeekDragActive(false)
    }
    setDragTarget(null)
  }, [dragTarget, setSeekDragActive])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const { totalFrames, currentFrame } = useEditorStore.getState()
    if (totalFrames <= 0) return
    const max = Math.max(0, totalFrames - 1)
    const big = Math.max(1, Math.round(max * 0.1))
    let next = currentFrame
    let handled = true
    switch (e.key) {
      case 'ArrowLeft':  next = clampFrame(currentFrame - 1, totalFrames); break
      case 'ArrowRight': next = clampFrame(currentFrame + 1, totalFrames); break
      case 'PageDown':   next = clampFrame(currentFrame - big, totalFrames); break
      case 'PageUp':     next = clampFrame(currentFrame + big, totalFrames); break
      case 'Home':       next = 0; break
      case 'End':        next = max; break
      default:           handled = false
    }
    if (!handled) return
    e.preventDefault()
    seek(next)
  }, [seek])

  if (totalFrames <= 0) return null

  const playheadPct = (currentFrame / (totalFrames - 1)) * 100
  const inPct     = (inFrame  / (totalFrames - 1)) * 100
  const outPct    = (outFrame / (totalFrames - 1)) * 100
  return (
    <div className="control-row flex items-center bg-bg-raised border-t border-border shrink-0">
      <button
        onClick={() => setInPoint(currentFrame)}
        className="btn shrink-0"
        data-pressed={pressedKey === '[' || undefined}
        aria-label="Set in point ([)"
        title="Set in point ([)"
      >
        [
      </button>

      <div
        className="relative h-7 flex-1 min-w-0 select-none overflow-visible"
        style={{ cursor: dragTarget === 'in' || dragTarget === 'out' ? 'ew-resize' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="slider"
        tabIndex={0}
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={totalFrames - 1}
        aria-valuenow={currentFrame}
        aria-valuetext={showFrames ? `${currentFrame}` : formatTime(fps > 0 ? frameToTime(currentFrame, fps) : 0, duration)}
        onKeyDown={onKeyDown}
      >
        <TrimRibbonVisual
          inPct={inPct}
          outPct={outPct}
          collapsedSelection={inFrame === outFrame}
          playheadPct={playheadPct}
          keyframePcts={keyframes.map((kf) => (kf / (totalFrames - 1)) * 100)}
          handleWidthPx={HANDLE_WIDTH_PX}
          barRef={barRef}
        />
      </div>

      <button
        onClick={() => setOutPoint(currentFrame)}
        className="btn shrink-0"
        data-pressed={pressedKey === ']' || undefined}
        aria-label="Set out point (])"
        title="Set out point (])"
      >
        ]
      </button>

    </div>
  )
})
