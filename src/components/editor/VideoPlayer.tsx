/**
 * videoplayer.tsx - <video> wrapper for the editor preview.
 *
 * interaction model:
 *   - single click on video = play/pause
 *   - drag on video (no existing crop) = draw crop rectangle
 *   - if crop exists: drag inside crop rect handled by cropoverlay,
 *     drag outside crop = nothing (just click = play/pause)
 *   - esc = clear crop
 */

import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { snap } from '../../lib/snap'

/* simple animated dots for loading state */
let _frame = 1
let _subs = new Set<() => void>()
let _timer: ReturnType<typeof setInterval> | null = null

function dotSubscribe(cb: () => void) {
  _subs.add(cb)
  if (!_timer) {
    _timer = setInterval(() => {
      _frame = (_frame + 1) % 4
      _subs.forEach((fn) => fn())
    }, 500)
  }
  return () => {
    _subs.delete(cb)
    if (_subs.size === 0 && _timer) {
      clearInterval(_timer)
      _timer = null
    }
  }
}
function dotSnapshot() { return _frame }

export function getLoadingDotsFrameText(frame: number): string {
  const dots = ['\u00A0', '.', '..', '...']
  return dots[((frame % 4) + 4) % 4]
}

function LoadingDots() {
  const f = useSyncExternalStore(dotSubscribe, dotSnapshot)
  return <span className="inline-block min-w-[3ch] text-left">{getLoadingDotsFrameText(f)}</span>
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

export const VideoPlayer = memo(function VideoPlayer({ videoRef }: Props) {
  const previewUrl = useEditorStore((s) => s.previewUrl)
  const ingestionStatus = useEditorStore((s) => s.ingestionStatus)
  const probe = useEditorStore((s) => s.probe)
  const setCrop = useEditorStore((s) => s.setCrop)
  const videoTrackIndex = useEditorStore((s) => s.videoProps.trackIndex)

  const [dragging, setDragging] = useState(false)
  const [snapGuides, setSnapGuides] = useState({ x: false, y: false })
  const dragOrigin = useRef<{ sx: number; sy: number } | null>(null)
  const movedEnough = useRef(false)
  const dragPointerId = useRef<number | null>(null)
  const playerRootRef = useRef<HTMLDivElement>(null)

  const sourceW = probe?.width ?? 1
  const sourceH = probe?.height ?? 1
  const centerX = sourceW / 2
  const centerY = sourceH / 2
  const snapZoneX = Math.max(8, sourceW * 0.012)
  const snapZoneY = Math.max(8, sourceH * 0.012)

  // set video source when previewurl changes
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!previewUrl || videoTrackIndex === null) {
      video.pause()
      video.removeAttribute('src')
      video.load()
      return
    }
    video.src = previewUrl
    video.load()
    return () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [previewUrl, videoRef, videoTrackIndex])

  // esc key clears crop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        useEditorStore.getState().setCrop(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  /**
   * compute the actual rendered content rect of the video,
   * accounting for object-fit:contain letterboxing.
   */
  const getContentRect = useCallback(() => {
    const video = videoRef.current
    if (!video) return { left: 0, top: 0, width: 1, height: 1 }
    const rect = video.getBoundingClientRect()
    const vw = video.videoWidth || sourceW
    const vh = video.videoHeight || sourceH
    const scaleX = rect.width / vw
    const scaleY = rect.height / vh
    const scale = Math.min(scaleX, scaleY)
    const cw = vw * scale
    const ch = vh * scale
    return {
      left: rect.left + (rect.width - cw) / 2,
      top: rect.top + (rect.height - ch) / 2,
      width: cw,
      height: ch,
    }
  }, [videoRef, sourceW, sourceH])

  /**
   * convert client coords to source-pixel coords.
   * uses the actual rendered content area (handles letterboxing and any zoom).
   */
  const toSource = useCallback((clientX: number, clientY: number) => {
    const cr = getContentRect()
    const sx = Math.max(0, Math.min(sourceW, ((clientX - cr.left) / cr.width) * sourceW))
    const sy = Math.max(0, Math.min(sourceH, ((clientY - cr.top) / cr.height) * sourceH))
    return { sx, sy }
  }, [getContentRect, sourceW, sourceH])

  /** check if a client point is inside the existing crop rect (in video coords). */
  const isInsideCrop = useCallback((clientX: number, clientY: number): boolean => {
    const currentCrop = useEditorStore.getState().crop
    if (!currentCrop) return false
    const { sx, sy } = toSource(clientX, clientY)
    return (
      sx >= currentCrop.x && sx <= currentCrop.x + currentCrop.width &&
      sy >= currentCrop.y && sy <= currentCrop.y + currentCrop.height
    )
  }, [toSource])

  /** check if a client point is on the actual rendered video content. */
  const isOnVideo = useCallback((clientX: number, clientY: number): boolean => {
    const cr = getContentRect()
    return clientX >= cr.left && clientX <= cr.left + cr.width && clientY >= cr.top && clientY <= cr.top + cr.height
  }, [getContentRect])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return

    if (e.button !== 0) return
    if (!isOnVideo(e.clientX, e.clientY)) return
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    dragPointerId.current = e.pointerId

    // if there's an existing crop, don't start a new one from outside it.
    // (cropoverlay handles drags inside crop via pointer-events-auto)
    const currentCrop = useEditorStore.getState().crop
    if (currentCrop) {
      // outside the crop? just treat as a click (play/pause on pointer up)
      if (!isInsideCrop(e.clientX, e.clientY)) {
        e.preventDefault()
        movedEnough.current = false
        setDragging(true)
        dragOrigin.current = null // no drag origin = no crop creation
        return
      }
      // inside crop is handled by cropoverlay, ignore here
      return
    }

    // no crop exists - prepare to draw one
    e.preventDefault()
    const origin = toSource(e.clientX, e.clientY)
    dragOrigin.current = origin
    movedEnough.current = false
    setSnapGuides({ x: false, y: false })
    setDragging(true)
  }, [isOnVideo, isInsideCrop, toSource])

  const applyDrag = useCallback((clientX: number, clientY: number) => {
    if (!dragging || !dragOrigin.current) return
    const current = toSource(clientX, clientY)
    const origin = dragOrigin.current
    const dx = Math.abs(current.sx - origin.sx)
    const dy = Math.abs(current.sy - origin.sy)

    if (!movedEnough.current) {
      if (dx < 4 && dy < 4) return
      movedEnough.current = true
    }

    const snappedCurrentX = snap(current.sx, centerX, snapZoneX)
    const snappedCurrentY = snap(current.sy, centerY, snapZoneY)
    setSnapGuides({ x: snappedCurrentX === centerX, y: snappedCurrentY === centerY })
    const x = Math.round(Math.min(origin.sx, snappedCurrentX))
    const y = Math.round(Math.min(origin.sy, snappedCurrentY))
    const w = Math.round(Math.max(1, Math.abs(snappedCurrentX - origin.sx)))
    const h = Math.round(Math.max(1, Math.abs(snappedCurrentY - origin.sy)))
    setCrop({ x, y, width: w, height: h })
  }, [centerX, centerY, dragging, setCrop, snapZoneX, snapZoneY, toSource])

  const finishDrag = useCallback((allowClickToggle: boolean) => {
    if (allowClickToggle && dragging && !movedEnough.current) {
      // click, not drag - toggle play/pause
      const video = videoRef.current
      if (video) {
        if (video.paused) video.play()
        else video.pause()
      }
    }
    setDragging(false)
    setSnapGuides({ x: false, y: false })
    dragOrigin.current = null
    movedEnough.current = false
    const root = playerRootRef.current
    if (root && dragPointerId.current !== null) {
      try {
        root.releasePointerCapture(dragPointerId.current)
      } catch {
        // pointer capture may already be released
      }
      dragPointerId.current = null
    }
  }, [dragging, videoRef])

  // keep tracking drag on window so drawing continues when overlay layers appear.
  useEffect(() => {
    if (!dragging) return

    const onWindowPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      if (dragPointerId.current !== null && e.pointerId !== dragPointerId.current) return
      applyDrag(e.clientX, e.clientY)
    }
    const onWindowPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      if (dragPointerId.current !== null && e.pointerId !== dragPointerId.current) return
      finishDrag(true)
    }

    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerUp)
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', onWindowPointerUp)
    }
  }, [dragging, applyDrag, finishDrag])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (dragPointerId.current !== null && e.pointerId !== dragPointerId.current) return
    applyDrag(e.clientX, e.clientY)
  }, [applyDrag])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (dragPointerId.current !== null && e.pointerId !== dragPointerId.current) return
    finishDrag(true)
  }, [finishDrag])

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (dragPointerId.current !== null && e.pointerId !== dragPointerId.current) return
    finishDrag(false)
  }, [finishDrag])

  const onPointerLeave = useCallback(() => {
    // intentionally no-op: window listeners keep drag continuity across layers.
  }, [])

  const showVideo = Boolean(previewUrl && videoTrackIndex !== null)
  const showAudioOnlyState = videoTrackIndex === null
  const shouldShowLoadingSpinner = (ingestionStatus === 'writing' || ingestionStatus === 'probing' || ingestionStatus === 'preview') || (videoTrackIndex !== null && !previewUrl)
  const audioOnlyReason = probe && probe.videoTracks.length === 0
    ? 'no video track found in source'
    : 'video disabled for this export'

  return (
    <div
      ref={playerRootRef}
      className="relative flex-1 flex items-center justify-center bg-bg-sunken overflow-hidden min-h-0"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
    >
      {showVideo && (
        <video
          ref={videoRef}
          className="max-w-full max-h-full object-contain"
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          preload="auto"
          tabIndex={0}
          aria-label="Video preview. Space to play/pause, comma/period to step frames."
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault()
              const v = videoRef.current
              if (v) { v.paused ? v.play() : v.pause() }
            }
          }}
        />
      )}

      {dragging && dragOrigin.current && snapGuides.x && (
        <div className="absolute top-0 bottom-0 left-1/2 w-px pointer-events-none" style={{ backgroundColor: 'color-mix(in srgb, var(--wasmux-accent) 80%, transparent)' }} />
      )}
      {dragging && dragOrigin.current && snapGuides.y && (
        <div className="absolute left-0 right-0 top-1/2 h-px pointer-events-none" style={{ backgroundColor: 'color-mix(in srgb, var(--wasmux-accent) 80%, transparent)' }} />
      )}

      {shouldShowLoadingSpinner && (
        <div className="flex flex-col items-center gap-2 text-text-muted select-text cursor-text">
          <div className="text-2xl font-mono"><LoadingDots /></div>
          <span>preparing preview</span>
        </div>
      )}

      {!showVideo && !shouldShowLoadingSpinner && showAudioOnlyState && (
        <div className="text-text-muted select-text cursor-text">{audioOnlyReason}</div>
      )}

      {!showVideo && !shouldShowLoadingSpinner && !showAudioOnlyState && (
        <div className="text-text-muted select-text cursor-text">preview unavailable</div>
      )}
    </div>
  )
})
