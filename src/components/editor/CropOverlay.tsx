/** draggable crop rectangle over the video preview. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import type { CropRegion } from '@/types/editor'
import { snapHorizontalPosition, snapVerticalPosition } from '@/lib/cropSnap'
import { DangerXButton } from '@/components/shared/DangerXButton'

type DragMode =
  | 'move'
  | 'nw' | 'ne' | 'sw' | 'se'
  | 'n' | 's' | 'e' | 'w'
  | null

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

export function CropOverlay({ videoRef }: Props) {
  const crop = useEditorStore((s) => s.crop)
  const probe = useEditorStore((s) => s.probe)
  const setCrop = useEditorStore((s) => s.setCrop)

  const overlayRef = useRef<HTMLDivElement>(null)
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [snapGuides, setSnapGuides] = useState({ x: false, y: false })
  const dragStart = useRef<{ x: number; y: number; crop: CropRegion } | null>(null)
  const dragPointerId = useRef<number | null>(null)

  /** pixel rect of the video content area relative to the overlay container. */
  const [contentRect, setContentRect] = useState({ left: 0, top: 0, width: 0, height: 0 })

  const sourceW = probe?.width ?? 1
  const sourceH = probe?.height ?? 1
  const centerX = sourceW / 2
  const centerY = sourceH / 2
  const snapZoneX = Math.max(8, sourceW * 0.012)
  const snapZoneY = Math.max(8, sourceH * 0.012)

  /** compute the video's actual rendered area relative to our overlay. */
  const updateContentRect = useCallback(() => {
    const video = videoRef.current
    const overlay = overlayRef.current
    if (!video || !overlay) return

    const vr = video.getBoundingClientRect()
    const or = overlay.getBoundingClientRect()
    const vw = video.videoWidth || sourceW
    const vh = video.videoHeight || sourceH
    const scaleX = vr.width / vw
    const scaleY = vr.height / vh
    const scale = Math.min(scaleX, scaleY)
    const cw = vw * scale
    const ch = vh * scale

    setContentRect({
      left: (vr.left - or.left) + (vr.width - cw) / 2,
      top: (vr.top - or.top) + (vr.height - ch) / 2,
      width: cw,
      height: ch,
    })
  }, [videoRef, sourceW, sourceH])

  // re-compute on resize, load, or when crop appears
  // also listen for layout shifts from log panel resize
  useEffect(() => {
    updateContentRect()
    const video = videoRef.current
    const overlay = overlayRef.current
    if (video) {
      video.addEventListener('loadedmetadata', updateContentRect)
      video.addEventListener('resize', updateContentRect)
    }
    window.addEventListener('resize', updateContentRect)

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateContentRect())
      : null

    if (resizeObserver) {
      if (video) resizeObserver.observe(video)
      if (overlay) resizeObserver.observe(overlay)
      if (overlay?.parentElement) resizeObserver.observe(overlay.parentElement)
      const main = document.getElementById('editor-main')
      if (main) resizeObserver.observe(main)
    }

    const observer = new MutationObserver(updateContentRect)
    const main = document.getElementById('editor-main')
    if (main) {
      observer.observe(main.parentElement || document.body, { attributes: true, subtree: false })
    }
    return () => {
      if (video) {
        video.removeEventListener('loadedmetadata', updateContentRect)
        video.removeEventListener('resize', updateContentRect)
      }
      window.removeEventListener('resize', updateContentRect)
      if (resizeObserver) resizeObserver.disconnect()
      observer.disconnect()
      const overlay = overlayRef.current
      if (overlay && dragPointerId.current !== null) {
        try {
          overlay.releasePointerCapture(dragPointerId.current)
        } catch (e) {
          // ignore
        }
        dragPointerId.current = null
      }
    }
  }, [videoRef, updateContentRect])

  // when the crop overlay first appears, layout can still be settling.
  // re-measure on the next frame as well so first drag/render aligns.
  useEffect(() => {
    if (!crop) return

    updateContentRect()
    const rafId = window.requestAnimationFrame(() => {
      updateContentRect()
    })

    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [crop, updateContentRect])

  const onPointerDown = useCallback((e: React.PointerEvent, mode: DragMode) => {
    e.preventDefault()
    e.stopPropagation()
    if (!crop) return
    const el = overlayRef.current
    if (el) el.setPointerCapture(e.pointerId)
    dragPointerId.current = e.pointerId
    setDragMode(mode)
    setSnapGuides({ x: false, y: false })
    dragStart.current = { x: e.clientX, y: e.clientY, crop: { ...crop } }
  }, [crop])

  const applyDrag = useCallback((clientX: number, clientY: number) => {
    if (!dragMode || !dragStart.current || !crop) return
    if (contentRect.width === 0 || contentRect.height === 0) return

    const dx = ((clientX - dragStart.current.x) / contentRect.width) * sourceW
    const dy = ((clientY - dragStart.current.y) / contentRect.height) * sourceH
    const orig = dragStart.current.crop

    let { x, y, width, height } = orig
    let snappedXGuide = false
    let snappedYGuide = false

    if (dragMode === 'move') {
      x = Math.max(0, Math.min(sourceW - width, orig.x + dx))
      y = Math.max(0, Math.min(sourceH - height, orig.y + dy))

      const xSnap = snapHorizontalPosition(x, width, centerX, snapZoneX, ['left', 'center', 'right'])
      const ySnap = snapVerticalPosition(y, height, centerY, snapZoneY, ['top', 'center', 'bottom'])
      x = Math.max(0, Math.min(sourceW - width, xSnap.x))
      y = Math.max(0, Math.min(sourceH - height, ySnap.y))
      snappedXGuide = xSnap.snapped
      snappedYGuide = ySnap.snapped
    } else {
      const right = orig.x + orig.width
      const bottom = orig.y + orig.height

      if (dragMode.includes('w')) {
        const unsnappedX = Math.max(0, Math.min(right - 16, orig.x + dx))
        const xSnap = snapHorizontalPosition(unsnappedX, orig.width, centerX, snapZoneX, ['left'])
        const newX = xSnap.x
        width = right - newX
        x = newX
        snappedXGuide = xSnap.snapped
      }
      if (dragMode.includes('e')) {
        const unsnappedRight = Math.max(orig.x + 16, Math.min(sourceW, right + dx))
        const xSnap = snapHorizontalPosition(unsnappedRight - orig.width, orig.width, centerX, snapZoneX, ['right'])
        const newRight = xSnap.x + orig.width
        width = newRight - orig.x
        snappedXGuide = xSnap.snapped
      }
      if (dragMode.includes('n')) {
        const unsnappedY = Math.max(0, Math.min(bottom - 16, orig.y + dy))
        const ySnap = snapVerticalPosition(unsnappedY, orig.height, centerY, snapZoneY, ['top'])
        const newY = ySnap.y
        height = bottom - newY
        y = newY
        snappedYGuide = ySnap.snapped
      }
      if (dragMode.includes('s')) {
        const unsnappedBottom = Math.max(orig.y + 16, Math.min(sourceH, bottom + dy))
        const ySnap = snapVerticalPosition(unsnappedBottom - orig.height, orig.height, centerY, snapZoneY, ['bottom'])
        const newBottom = ySnap.y + orig.height
        height = newBottom - orig.y
        snappedYGuide = ySnap.snapped
      }

      width = Math.max(16, Math.min(sourceW - x, width))
      height = Math.max(16, Math.min(sourceH - y, height))
    }

    setSnapGuides({ x: snappedXGuide, y: snappedYGuide })

    setCrop({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) })
  }, [dragMode, crop, setCrop, sourceW, sourceH, contentRect, centerX, centerY, snapZoneX, snapZoneY])

  const finishDrag = useCallback((pointerId?: number) => {
    if (dragPointerId.current !== null && pointerId !== undefined && pointerId !== dragPointerId.current) {
      return
    }

    const el = overlayRef.current
    if (el && dragPointerId.current !== null) {
      try {
        el.releasePointerCapture(dragPointerId.current)
      } catch {
        // ignore if already released
      }
    }
    setDragMode(null)
    setSnapGuides({ x: false, y: false })
    dragStart.current = null
    dragPointerId.current = null
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragPointerId.current !== null && e.pointerId !== dragPointerId.current) return
    applyDrag(e.clientX, e.clientY)
  }, [applyDrag])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    finishDrag(e.pointerId)
  }, [finishDrag])

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    finishDrag(e.pointerId)
  }, [finishDrag])

  useEffect(() => {
    if (!dragMode) return

    const onWindowPointerMove = (e: PointerEvent) => {
      if (dragPointerId.current !== null && e.pointerId !== dragPointerId.current) return
      applyDrag(e.clientX, e.clientY)
    }

    const onWindowPointerUp = (e: PointerEvent) => {
      finishDrag(e.pointerId)
    }

    const onWindowPointerCancel = (e: PointerEvent) => {
      finishDrag(e.pointerId)
    }

    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerCancel)

    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointercancel', onWindowPointerCancel)
    }
  }, [applyDrag, dragMode, finishDrag])

  /** arrow keys: move crop (plain) or resize (shift). */
  const STEP = 10
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!crop) return
    let dx = 0, dy = 0
    if (e.key === 'ArrowLeft')  dx = -STEP
    if (e.key === 'ArrowRight') dx = STEP
    if (e.key === 'ArrowUp')    dy = -STEP
    if (e.key === 'ArrowDown')  dy = STEP
    if (dx === 0 && dy === 0) return
    e.preventDefault()

    if (e.shiftKey) {
      setCrop({
        x: crop.x,
        y: crop.y,
        width: Math.max(16, crop.width + dx),
        height: Math.max(16, crop.height + dy),
      })
    } else {
      setCrop({
        x: crop.x + dx,
        y: crop.y + dy,
        width: crop.width,
        height: crop.height,
      })
    }
  }, [crop, setCrop])

  if (!crop) return null

  const left = (crop.x / sourceW) * 100
  const top = (crop.y / sourceH) * 100
  const width = (crop.width / sourceW) * 100
  const height = (crop.height / sourceH) * 100

  const snapXActive = dragMode !== null && snapGuides.x
  const snapYActive = dragMode !== null && snapGuides.y

  const edgeHandleClass = 'absolute z-20 opacity-0 pointer-events-auto focus:opacity-100 focus:outline-2 focus:outline-offset-1 focus:outline-white focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white'
  const cornerHandleClass = 'absolute z-30 h-5 w-5 opacity-0 pointer-events-auto focus:opacity-100 focus:outline-2 focus:outline-offset-1 focus:outline-white focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white'

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* inner wrapper aligned to the actual video content area */}
      <div
        className="absolute"
        style={{
          left: `${contentRect.left}px`,
          top: `${contentRect.top}px`,
          width: `${contentRect.width}px`,
          height: `${contentRect.height}px`,
        }}
      >
        {snapXActive && (
          <div
            className="absolute top-0 bottom-0 w-px bg-accent/80 pointer-events-none"
            style={{ left: `${(centerX / sourceW) * 100}%` }}
          />
        )}
        {snapYActive && (
          <div
            className="absolute left-0 right-0 h-px bg-accent/80 pointer-events-none"
            style={{ top: `${(centerY / sourceH) * 100}%` }}
          />
        )}

        {/* dark mask - single shadow mask avoids subpixel seams during drag */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
            }}
            aria-hidden="true"
          />
        </div>

        {/* crop rectangle border - pointer-events-auto so handles work */}
        <div
          className="absolute cursor-move pointer-events-auto"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: `${width}%`,
            height: `${height}%`,
          }}
          onPointerDown={(e) => onPointerDown(e, 'move')}
          onKeyDown={onKeyDown}
          tabIndex={0}
          role="group"
          aria-label={`Crop region ${crop.width}×${crop.height} at ${crop.x},${crop.y}. Arrow keys to move, Shift+arrows to resize.`}
        >
          <div className="absolute left-[2px] right-[2px] top-0 h-[3px] pointer-events-none bg-[length:30px_3px] bg-repeat-x" style={{ backgroundImage: 'linear-gradient(to right, var(--wasmux-accent) 0 20px, transparent 20px 30px)' }} aria-hidden="true" />
          <div className="absolute left-[2px] right-[2px] bottom-0 h-[3px] pointer-events-none bg-[length:30px_3px] bg-repeat-x" style={{ backgroundImage: 'linear-gradient(to right, var(--wasmux-accent) 0 20px, transparent 20px 30px)' }} aria-hidden="true" />
          <div className="absolute top-[2px] bottom-[2px] left-0 w-[3px] pointer-events-none bg-[length:3px_30px] bg-repeat-y" style={{ backgroundImage: 'linear-gradient(to bottom, var(--wasmux-accent) 0 20px, transparent 20px 30px)' }} aria-hidden="true" />
          <div className="absolute top-[2px] bottom-[2px] right-0 w-[3px] pointer-events-none bg-[length:3px_30px] bg-repeat-y" style={{ backgroundImage: 'linear-gradient(to bottom, var(--wasmux-accent) 0 20px, transparent 20px 30px)' }} aria-hidden="true" />

          <DangerXButton
            label="Clear crop (Esc)"
            className="absolute -right-7 -top-7 z-40 pointer-events-auto"
            onPointerDown={(e) => { e.stopPropagation() }}
            onClick={(e) => { e.stopPropagation(); setCrop(null) }}
          />

          <div className={`${cornerHandleClass} -left-2 -top-2 cursor-nw-resize`} onPointerDown={(e) => onPointerDown(e, 'nw')} role="button" aria-label="Resize crop from top-left corner" />
          <div className={`${cornerHandleClass} -right-2 -top-2 cursor-ne-resize`} onPointerDown={(e) => onPointerDown(e, 'ne')} role="button" aria-label="Resize crop from top-right corner" />
          <div className={`${cornerHandleClass} -left-2 -bottom-2 cursor-sw-resize`} onPointerDown={(e) => onPointerDown(e, 'sw')} role="button" aria-label="Resize crop from bottom-left corner" />
          <div className={`${cornerHandleClass} -right-2 -bottom-2 cursor-se-resize`} onPointerDown={(e) => onPointerDown(e, 'se')} role="button" aria-label="Resize crop from bottom-right corner" />

          <div className={`${edgeHandleClass} -top-2 left-2 right-2 h-4 cursor-n-resize`} onPointerDown={(e) => onPointerDown(e, 'n')} role="button" aria-label="Resize crop from top edge" />
          <div className={`${edgeHandleClass} -bottom-2 left-2 right-2 h-4 cursor-s-resize`} onPointerDown={(e) => onPointerDown(e, 's')} role="button" aria-label="Resize crop from bottom edge" />
          <div className={`${edgeHandleClass} top-2 bottom-2 -left-2 w-4 cursor-w-resize`} onPointerDown={(e) => onPointerDown(e, 'w')} role="button" aria-label="Resize crop from left edge" />
          <div className={`${edgeHandleClass} top-2 bottom-2 -right-2 w-4 cursor-e-resize`} onPointerDown={(e) => onPointerDown(e, 'e')} role="button" aria-label="Resize crop from right edge" />
        </div>
      </div>
    </div>
  )
}
