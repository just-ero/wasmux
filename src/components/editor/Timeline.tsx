/**
 * timeline.tsx - draggable timeline ribbon for trim and seek.
 *
 * layout is [in button] [bar] [out button].
 * people can click to seek, drag handles to trim, and see keyframe marks.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { clampFrame, formatTime, frameToTime } from '../../lib/frameUtils'
import { snap } from '../../lib/snap'
import * as Icons from '../shared/Icons'
import { TrimRibbonVisual } from './TrimRibbonVisual'

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
  const probe = useEditorStore((s) => s.probe)
  const fps = probe?.fps ?? 0
  const duration = probe?.duration ?? 0

  const barRef = useRef<HTMLDivElement>(null)
  const [dragTarget, setDragTarget] = useState<DragTarget>(null)
  const activePointerId = useRef<number | null>(null)

  const sel = selections[0]
  const inFrame = sel?.start ?? 0
  const outFrame = sel?.end ?? Math.max(0, totalFrames - 1)

  const SNAP_PX = 6
  const EDGE_HIT_PX = 10
  const HANDLE_WIDTH_PX = 4

  /** convert pointer x into a frame index, with optional playhead snap. */
  const xToFrame = useCallback((clientX: number, snapToPlayhead = false) => {
    const bar = barRef.current
    if (!bar || totalFrames <= 0) return 0
    const rect = bar.getBoundingClientRect()
    const mouseX = clientX - rect.left
    const ratio = Math.max(0, Math.min(1, mouseX / rect.width))
    let frame = clampFrame(Math.round(ratio * (totalFrames - 1)), totalFrames)

    if (snapToPlayhead && totalFrames > 1) {
      const playheadX = (currentFrame / (totalFrames - 1)) * rect.width
      const snappedX = snap(mouseX, playheadX, SNAP_PX)
      if (snappedX === playheadX) frame = currentFrame
    }

    return frame
  }, [totalFrames, currentFrame])

  /** seek playhead and softly snap to in/out edges. */
  const seekTo = useCallback((frame: number) => {
    const video = videoRef.current
    if (!video || fps <= 0) return
    // this gives a sticky feel near trim edges so seeking is less fiddly.
    const bar = barRef.current
    if (bar && totalFrames > 1) {
      const rect = bar.getBoundingClientRect()
      const frameX = (frame / (totalFrames - 1)) * rect.width
      const inX = (inFrame / (totalFrames - 1)) * rect.width
      const outX = (outFrame / (totalFrames - 1)) * rect.width
      if (Math.abs(frameX - inX) < SNAP_PX) frame = inFrame
      else if (Math.abs(frameX - outX) < SNAP_PX) frame = outFrame
    }
    video.currentTime = frameToTime(frame, fps)
    useEditorStore.getState().setCurrentFrame(frame)
  }, [videoRef, fps, totalFrames, inFrame, outFrame])

  /** detect whether pointer is close enough to grab an edge handle. */
  const detectEdge = useCallback((clientX: number): 'in' | 'out' | null => {
    const bar = barRef.current
    if (!bar || totalFrames <= 1) return null
    const rect = bar.getBoundingClientRect()
    const inX = (inFrame / (totalFrames - 1)) * rect.width + rect.left
    const outX = (outFrame / (totalFrames - 1)) * rect.width + rect.left
    if (Math.abs(clientX - inX) < EDGE_HIT_PX) return 'in'
    if (Math.abs(clientX - outX) < EDGE_HIT_PX) return 'out'
    return null
  }, [totalFrames, inFrame, outFrame])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    e.preventDefault()
    const bar = barRef.current
    if (!bar) return
    activePointerId.current = e.pointerId
    bar.setPointerCapture(e.pointerId)

    const edge = detectEdge(e.clientX)
    if (edge) {
      setDragTarget(edge)
    } else {
      setDragTarget('seek')
      const video = videoRef.current
      if (video && !video.paused) video.pause()
      seekTo(xToFrame(e.clientX))
    }
  }, [detectEdge, seekTo, xToFrame, videoRef])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
    if (!dragTarget) return
    if (dragTarget === 'seek') {
      seekTo(xToFrame(e.clientX))
    } else if (dragTarget === 'in') {
      const frame = xToFrame(e.clientX, true)
      const newStart = Math.min(frame, outFrame)
      setSelections([{ id: 'full', start: newStart, end: outFrame }])
    } else if (dragTarget === 'out') {
      const frame = xToFrame(e.clientX, true)
      const newEnd = Math.max(frame, inFrame)
      setSelections([{ id: 'full', start: inFrame, end: newEnd }])
    }
  }, [dragTarget, seekTo, xToFrame, inFrame, outFrame, setSelections])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    setDragTarget(null)
  }, [])

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    setDragTarget(null)
  }, [])

  const applyDrag = useCallback((clientX: number) => {
    if (!dragTarget) return
    if (dragTarget === 'seek') {
      seekTo(xToFrame(clientX))
    } else if (dragTarget === 'in') {
      const frame = xToFrame(clientX, true)
      const newStart = Math.min(frame, outFrame)
      setSelections([{ id: 'full', start: newStart, end: outFrame }])
    } else if (dragTarget === 'out') {
      const frame = xToFrame(clientX, true)
      const newEnd = Math.max(frame, inFrame)
      setSelections([{ id: 'full', start: inFrame, end: newEnd }])
    }
  }, [dragTarget, inFrame, outFrame, seekTo, setSelections, xToFrame])

  useEffect(() => {
    if (!dragTarget) return

    const onWindowPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
      applyDrag(e.clientX)
    }

    const onWindowPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
      activePointerId.current = null
      setDragTarget(null)
    }

    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerUp)

    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointercancel', onWindowPointerUp)
    }
  }, [applyDrag, dragTarget])

  const onTimelineKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (totalFrames <= 0) return

    const maxFrame = Math.max(0, totalFrames - 1)
    const step = 1
    const bigStep = Math.max(1, Math.round(maxFrame * 0.1))
    let nextFrame = currentFrame
    let handled = true

    switch (e.key) {
      case 'ArrowLeft':
        nextFrame = clampFrame(currentFrame - step, totalFrames)
        break
      case 'ArrowRight':
        nextFrame = clampFrame(currentFrame + step, totalFrames)
        break
      case 'PageDown':
        nextFrame = clampFrame(currentFrame - bigStep, totalFrames)
        break
      case 'PageUp':
        nextFrame = clampFrame(currentFrame + bigStep, totalFrames)
        break
      case 'Home':
        nextFrame = 0
        break
      case 'End':
        nextFrame = maxFrame
        break
      default:
        handled = false
    }

    if (!handled) return
    e.preventDefault()
    seekTo(nextFrame)
  }, [currentFrame, seekTo, totalFrames])

  /** set in point at current playhead frame. */
  const setIn = useCallback(() => {
    setInPoint(currentFrame)
  }, [currentFrame, setInPoint])

  /** set out point at current playhead frame. */
  const setOut = useCallback(() => {
    setOutPoint(currentFrame)
  }, [currentFrame, setOutPoint])

  if (totalFrames <= 0) return null

  const playheadPct = (currentFrame / (totalFrames - 1)) * 100
  const inPct = (inFrame / (totalFrames - 1)) * 100
  const outPct = (outFrame / (totalFrames - 1)) * 100
  const collapsedSelection = inFrame === outFrame
  const keyframePcts = keyframes.map((kf) => (kf / (totalFrames - 1)) * 100)

  return (
    <div className="control-row flex items-center bg-bg-raised border-t border-border shrink-0">
      {/* in button */}
      <button
        onClick={setIn}
        className="btn shrink-0"
        data-pressed={pressedKey === '[' || undefined}
        aria-label="Set in point ([)"
        title="Set in point ([)"
      >
        <Icons.BracketLeft width={14} height={14} />
      </button>

      {/* timeline bar */}
      <div
        className="relative h-7 flex-1 min-w-0 select-none overflow-visible"
        style={{
          cursor: dragTarget === 'in' || dragTarget === 'out' ? 'ew-resize' : 'crosshair',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        role="slider"
        tabIndex={0}
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={totalFrames - 1}
        aria-valuenow={currentFrame}
        aria-valuetext={showFrames ? `${currentFrame}` : formatTime(fps > 0 ? frameToTime(currentFrame, fps) : 0, duration)}
        onKeyDown={onTimelineKeyDown}
      >
        <TrimRibbonVisual
          inPct={inPct}
          outPct={outPct}
          collapsedSelection={collapsedSelection}
          playheadPct={playheadPct}
          keyframePcts={keyframePcts}
          handleWidthPx={HANDLE_WIDTH_PX}
          barRef={barRef}
        />
      </div>

      {/* out button */}
      <button
        onClick={setOut}
        className="btn shrink-0"
        data-pressed={pressedKey === ']' || undefined}
        aria-label="Set out point (])"
        title="Set out point (])"
      >
        <Icons.BracketRight width={14} height={14} />
      </button>
    </div>
  )
})
