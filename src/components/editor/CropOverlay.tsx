/** draggable crop rectangle over the video preview. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import type { CropRegion } from '@/types/editor'
import { snapHorizontalPosition, snapVerticalPosition } from '@/lib/cropSnap'
import { snap } from '@/lib/snap'
import { DangerXButton } from '@/components/shared/DangerXButton'

type DragMode =
  | 'create'
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
  const previewUrl = useEditorStore((s) => s.previewUrl)
  const videoTrackIndex = useEditorStore((s) => s.videoProps.trackIndex)

  const overlayRef = useRef<HTMLDivElement>(null)
  const contentRectRef = useRef({ left: 0, top: 0, width: 0, height: 0 })
  const measureRafRef = useRef<number | null>(null)
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [snapGuides, setSnapGuides] = useState({ x: false, y: false })
  const dragStart = useRef<{ x: number; y: number; crop: CropRegion } | null>(null)
  const createOrigin = useRef<{ sx: number; sy: number } | null>(null)
  const movedEnough = useRef(false)
  const dragPointerId = useRef<number | null>(null)

  /** pixel rect of the video content area relative to the overlay container. */
  const [contentRect, setContentRect] = useState({ left: 0, top: 0, width: 0, height: 0 })

  const sourceW = probe?.width ?? 1
  const sourceH = probe?.height ?? 1
  const hasRenderableVideo = Boolean(previewUrl && videoTrackIndex !== null)
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

    const nextRect = {
      left: Math.round(((vr.left - or.left) + (vr.width - cw) / 2) * 100) / 100,
      top: Math.round(((vr.top - or.top) + (vr.height - ch) / 2) * 100) / 100,
      width: Math.round(cw * 100) / 100,
      height: Math.round(ch * 100) / 100,
    }

    const prev = contentRectRef.current
    if (
      prev.left === nextRect.left &&
      prev.top === nextRect.top &&
      prev.width === nextRect.width &&
      prev.height === nextRect.height
    ) {
      return
    }

    contentRectRef.current = nextRect
    setContentRect(nextRect)
  }, [videoRef, sourceW, sourceH])

  const scheduleContentRectUpdate = useCallback(() => {
    if (measureRafRef.current !== null) return
    measureRafRef.current = window.requestAnimationFrame(() => {
      measureRafRef.current = null
      updateContentRect()
    })
  }, [updateContentRect])

  // re-compute on resize, load, or when crop appears
  // also listen for layout shifts from log panel resize
  useEffect(() => {
    scheduleContentRectUpdate()
    const video = videoRef.current
    const overlay = overlayRef.current
    if (video) {
      video.addEventListener('loadedmetadata', scheduleContentRectUpdate)
      video.addEventListener('resize', scheduleContentRectUpdate)
    }
    window.addEventListener('resize', scheduleContentRectUpdate)

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => scheduleContentRectUpdate())
      : null

    if (resizeObserver) {
      if (video) resizeObserver.observe(video)
      if (overlay?.parentElement) resizeObserver.observe(overlay.parentElement)
      const main = document.getElementById('editor-main')
      if (main) resizeObserver.observe(main)
    }

    return () => {
      if (video) {
        video.removeEventListener('loadedmetadata', scheduleContentRectUpdate)
        video.removeEventListener('resize', scheduleContentRectUpdate)
      }
      window.removeEventListener('resize', scheduleContentRectUpdate)
      if (resizeObserver) resizeObserver.disconnect()
      if (measureRafRef.current !== null) {
        window.cancelAnimationFrame(measureRafRef.current)
        measureRafRef.current = null
      }
      const overlay = overlayRef.current
      if (overlay && dragPointerId.current !== null) {
        try {
          overlay.releasePointerCapture(dragPointerId.current)
        } catch {
          // ignore
        }
        dragPointerId.current = null
      }
    }
  }, [videoRef, scheduleContentRectUpdate, hasRenderableVideo])

  useEffect(() => {
    if (!crop) return
    scheduleContentRectUpdate()
  }, [crop, scheduleContentRectUpdate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        useEditorStore.getState().setCrop(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toSource = useCallback((clientX: number, clientY: number) => {
    const overlay = overlayRef.current
    if (!overlay) return { sx: 0, sy: 0, onVideo: false }

    // If we have a stale/zero rect (e.g. first paint), measure immediately.
    if (contentRectRef.current.width === 0 || contentRectRef.current.height === 0) {
      updateContentRect()
    }

    const rect = contentRectRef.current
    if (rect.width === 0 || rect.height === 0) {
      return { sx: 0, sy: 0, onVideo: false }
    }

    const or = overlay.getBoundingClientRect()
    const localX = clientX - or.left
    const localY = clientY - or.top

    const onVideo =
      localX >= rect.left &&
      localX <= rect.left + rect.width &&
      localY >= rect.top &&
      localY <= rect.top + rect.height

    const sx = Math.max(0, Math.min(sourceW, ((localX - rect.left) / rect.width) * sourceW))
    const sy = Math.max(0, Math.min(sourceH, ((localY - rect.top) / rect.height) * sourceH))
    return { sx, sy, onVideo }
  }, [sourceH, sourceW, updateContentRect])

  const onCreatePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || e.button !== 0) return
    const point = toSource(e.clientX, e.clientY)
    if (!point.onVideo) return

    e.preventDefault()
    e.stopPropagation()
    const el = overlayRef.current
    if (el) el.setPointerCapture(e.pointerId)
    dragPointerId.current = e.pointerId
    setDragMode('create')
    setSnapGuides((prev) => (prev.x || prev.y ? { x: false, y: false } : prev))
    createOrigin.current = { sx: point.sx, sy: point.sy }
    movedEnough.current = false
  }, [toSource])

  const onPointerDown = useCallback((e: React.PointerEvent, mode: DragMode) => {
    e.preventDefault()
    e.stopPropagation()
    if (!crop) return
    const el = overlayRef.current
    if (el) el.setPointerCapture(e.pointerId)
    dragPointerId.current = e.pointerId
    setDragMode(mode)
    setSnapGuides((prev) => (prev.x || prev.y ? { x: false, y: false } : prev))
    dragStart.current = { x: e.clientX, y: e.clientY, crop: { ...crop } }
  }, [crop])

  const applyDrag = useCallback((clientX: number, clientY: number, constrainAspect: boolean, mirrorResize: boolean) => {
    if (!dragMode) return
    if (contentRect.width === 0 || contentRect.height === 0) return

    if (dragMode === 'create') {
      if (!createOrigin.current) return
      const origin = createOrigin.current
      const current = toSource(clientX, clientY)

      let nextSx = current.sx
      let nextSy = current.sy

      if (constrainAspect) {
        const deltaX = current.sx - origin.sx
        const deltaY = current.sy - origin.sy
        const signX = deltaX === 0 ? 1 : Math.sign(deltaX)
        const signY = deltaY === 0 ? 1 : Math.sign(deltaY)
        const sizeFromPointer = Math.max(Math.abs(deltaX), Math.abs(deltaY))
        const maxSizeX = signX >= 0 ? sourceW - origin.sx : origin.sx
        const maxSizeY = signY >= 0 ? sourceH - origin.sy : origin.sy
        const size = Math.max(1, Math.min(sizeFromPointer, maxSizeX, maxSizeY))
        nextSx = origin.sx + signX * size
        nextSy = origin.sy + signY * size
      }

      const dxCreate = Math.abs(nextSx - origin.sx)
      const dyCreate = Math.abs(nextSy - origin.sy)
      if (!movedEnough.current) {
        if (dxCreate < 4 && dyCreate < 4) return
        movedEnough.current = true
      }

      let snappedCurrentX = snap(nextSx, centerX, snapZoneX)
      let snappedCurrentY = snap(nextSy, centerY, snapZoneY)

      if (constrainAspect) {
        const fallbackSignX = nextSx >= origin.sx ? 1 : -1
        const fallbackSignY = nextSy >= origin.sy ? 1 : -1
        const deltaX = snappedCurrentX - origin.sx
        const deltaY = snappedCurrentY - origin.sy
        const signX = deltaX === 0 ? fallbackSignX : Math.sign(deltaX)
        const signY = deltaY === 0 ? fallbackSignY : Math.sign(deltaY)
        const sizeFromSnap = Math.max(Math.abs(deltaX), Math.abs(deltaY))
        const maxSizeX = signX >= 0 ? sourceW - origin.sx : origin.sx
        const maxSizeY = signY >= 0 ? sourceH - origin.sy : origin.sy
        const size = Math.max(1, Math.min(sizeFromSnap, maxSizeX, maxSizeY))
        snappedCurrentX = origin.sx + signX * size
        snappedCurrentY = origin.sy + signY * size
      }

      const nextGuides = { x: snappedCurrentX === centerX, y: snappedCurrentY === centerY }
      setSnapGuides((prev) => (prev.x === nextGuides.x && prev.y === nextGuides.y ? prev : nextGuides))
      const x = Math.round(Math.min(origin.sx, snappedCurrentX))
      const y = Math.round(Math.min(origin.sy, snappedCurrentY))
      const w = Math.round(Math.max(1, Math.abs(snappedCurrentX - origin.sx)))
      const h = Math.round(Math.max(1, Math.abs(snappedCurrentY - origin.sy)))
      setCrop({ x, y, width: w, height: h })
      return
    }

    if (!dragStart.current || !crop) return

    const dx = ((clientX - dragStart.current.x) / contentRect.width) * sourceW
    const dy = ((clientY - dragStart.current.y) / contentRect.height) * sourceH
    const orig = dragStart.current.crop

    let { x, y, width, height } = orig
    let snappedXGuide = false
    let snappedYGuide = false
    const aspect = Math.max(1 / 4096, orig.width / Math.max(1, orig.height))
    const origLeft = orig.x
    const origRight = orig.x + orig.width
    const origTop = orig.y
    const origBottom = orig.y + orig.height
    const hasW = dragMode.includes('w')
    const hasE = dragMode.includes('e')
    const hasN = dragMode.includes('n')
    const hasS = dragMode.includes('s')

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
      // allow handles/corners to cross over the opposite side and flip naturally.
      let left = origLeft
      let right = origRight
      let top = origTop
      let bottom = origBottom

      if (mirrorResize) {
        // Alt-resize: grabbed edge drives, opposite edge is exact projection via fixed center.
        const cx = (origLeft + origRight) / 2
        const cy = (origTop + origBottom) / 2
        let draggedLeft = origLeft
        let draggedRight = origRight
        let draggedTop = origTop
        let draggedBottom = origBottom

        if (hasW && !hasE) {
          draggedLeft = origLeft + dx
          const snapped = snap(draggedLeft, centerX, snapZoneX)
          if (snapped === centerX) {
            draggedLeft = centerX
            snappedXGuide = true
          }
        } else if (hasE && !hasW) {
          draggedRight = origRight + dx
          const snapped = snap(draggedRight, centerX, snapZoneX)
          if (snapped === centerX) {
            draggedRight = centerX
            snappedXGuide = true
          }
        }

        if (hasN && !hasS) {
          draggedTop = origTop + dy
          const snapped = snap(draggedTop, centerY, snapZoneY)
          if (snapped === centerY) {
            draggedTop = centerY
            snappedYGuide = true
          }
        } else if (hasS && !hasN) {
          draggedBottom = origBottom + dy
          const snapped = snap(draggedBottom, centerY, snapZoneY)
          if (snapped === centerY) {
            draggedBottom = centerY
            snappedYGuide = true
          }
        }

        if (hasW && !hasE) {
          const mirroredRight = 2 * cx - draggedLeft
          if (mirroredRight > sourceW) {
            right = sourceW
            left = Math.min(draggedLeft, right - 1)
          } else if (draggedLeft < 0) {
            left = 0
            right = Math.max(left + 1, mirroredRight)
          } else {
            left = draggedLeft
            right = mirroredRight
          }
        } else if (hasE && !hasW) {
          const mirroredLeft = 2 * cx - draggedRight
          if (mirroredLeft < 0) {
            left = 0
            right = Math.max(left + 1, draggedRight)
          } else if (draggedRight > sourceW) {
            right = sourceW
            left = Math.min(right - 1, mirroredLeft)
          } else {
            left = mirroredLeft
            right = draggedRight
          }
        }

        if (hasN && !hasS) {
          const mirroredBottom = 2 * cy - draggedTop
          if (mirroredBottom > sourceH) {
            bottom = sourceH
            top = Math.min(draggedTop, bottom - 1)
          } else if (draggedTop < 0) {
            top = 0
            bottom = Math.max(top + 1, mirroredBottom)
          } else {
            top = draggedTop
            bottom = mirroredBottom
          }
        } else if (hasS && !hasN) {
          const mirroredTop = 2 * cy - draggedBottom
          if (mirroredTop < 0) {
            top = 0
            bottom = Math.max(top + 1, draggedBottom)
          } else if (draggedBottom > sourceH) {
            bottom = sourceH
            top = Math.min(bottom - 1, mirroredTop)
          } else {
            top = mirroredTop
            bottom = draggedBottom
          }
        }
      } else {
        // non-mirrored resize: active handles can cross over; anchors stay deterministic.
        if (hasW) left = Math.max(0, Math.min(sourceW, origLeft + dx))
        if (hasE) right = Math.max(0, Math.min(sourceW, origRight + dx))
        if (hasN) top = Math.max(0, Math.min(sourceH, origTop + dy))
        if (hasS) bottom = Math.max(0, Math.min(sourceH, origBottom + dy))
      }

      let rawWidth = Math.max(1, Math.abs(right - left))
      let rawHeight = Math.max(1, Math.abs(bottom - top))

      if (constrainAspect) {
        const hasHoriz = hasW || hasE
        const hasVert = hasN || hasS
        const scaleW = rawWidth / Math.max(1, orig.width)
        const scaleH = rawHeight / Math.max(1, orig.height)
        const scale = hasHoriz && hasVert
          ? Math.max(scaleW, scaleH)
          : hasHoriz
            ? scaleW
            : scaleH

        rawWidth = Math.max(1, orig.width * scale)
        rawHeight = Math.max(1, rawWidth / aspect)

        const signX = right >= left ? 1 : -1
        const signY = bottom >= top ? 1 : -1
        const centerXOfOrig = (origLeft + origRight) / 2
        const centerYOfOrig = (origTop + origBottom) / 2

        if (mirrorResize || (!hasW && !hasE)) {
          left = centerXOfOrig - (rawWidth / 2) * signX
          right = centerXOfOrig + (rawWidth / 2) * signX
        } else if (hasW) {
          right = origRight
          left = right - rawWidth * signX
        } else {
          left = origLeft
          right = left + rawWidth * signX
        }

        if (mirrorResize || (!hasN && !hasS)) {
          top = centerYOfOrig - (rawHeight / 2) * signY
          bottom = centerYOfOrig + (rawHeight / 2) * signY
        } else if (hasN) {
          bottom = origBottom
          top = bottom - rawHeight * signY
        } else {
          top = origTop
          bottom = top + rawHeight * signY
        }
      }

      if (!mirrorResize) {
        // snap only the actively dragged edge(s) while keeping the opposite sides fixed.
        if (hasW && !hasE) {
          const snappedLeft = snap(left, centerX, snapZoneX)
          if (snappedLeft === centerX) {
            left = Math.max(0, Math.min(right - 1, centerX))
            snappedXGuide = true
          }
        } else if (hasE && !hasW) {
          const snappedRight = snap(right, centerX, snapZoneX)
          if (snappedRight === centerX) {
            right = Math.max(left + 1, Math.min(sourceW, centerX))
            snappedXGuide = true
          }
        }

        if (hasN && !hasS) {
          const snappedTop = snap(top, centerY, snapZoneY)
          if (snappedTop === centerY) {
            top = Math.max(0, Math.min(bottom - 1, centerY))
            snappedYGuide = true
          }
        } else if (hasS && !hasN) {
          const snappedBottom = snap(bottom, centerY, snapZoneY)
          if (snappedBottom === centerY) {
            bottom = Math.max(top + 1, Math.min(sourceH, centerY))
            snappedYGuide = true
          }
        }

        // For corner + aspect resize, keep snapped axis locked and project the other axis.
        if (constrainAspect && (hasW || hasE) && (hasN || hasS)) {
          const anchorX = hasW ? origRight : origLeft
          const anchorY = hasN ? origBottom : origTop
          const draggedX = hasW ? left : right
          const draggedY = hasN ? top : bottom

          const scaleFromX = Math.abs(draggedX - anchorX) / Math.max(1, orig.width)
          const scaleFromY = Math.abs(draggedY - anchorY) / Math.max(1, orig.height)
          const scale = snappedXGuide && !snappedYGuide
            ? scaleFromX
            : snappedYGuide && !snappedXGuide
              ? scaleFromY
              : Math.max(scaleFromX, scaleFromY)

          const nextW = Math.max(1, orig.width * scale)
          const nextH = Math.max(1, orig.height * scale)
          const signX = draggedX >= anchorX ? 1 : -1
          const signY = draggedY >= anchorY ? 1 : -1
          const projectedX = anchorX + signX * nextW
          const projectedY = anchorY + signY * nextH

          if (hasW) {
            left = projectedX
            right = anchorX
          } else {
            left = anchorX
            right = projectedX
          }

          if (hasN) {
            top = projectedY
            bottom = anchorY
          } else {
            top = anchorY
            bottom = projectedY
          }
        }

        // with aspect-constrained edge drags, projected opposite-axis sides should also be snappable.
        if (constrainAspect && (hasW !== hasE)) {
          const ySnap = snapVerticalPosition(top, Math.max(1, Math.abs(bottom - top)), centerY, snapZoneY, ['top', 'bottom'])
          if (ySnap.snapped) {
            top = ySnap.y
            bottom = ySnap.y + Math.max(1, Math.abs(bottom - top))
            snappedYGuide = true
          }
        }
        if (constrainAspect && (hasN !== hasS)) {
          const xSnap = snapHorizontalPosition(left, Math.max(1, Math.abs(right - left)), centerX, snapZoneX, ['left', 'right'])
          if (xSnap.snapped) {
            left = xSnap.x
            right = xSnap.x + Math.max(1, Math.abs(right - left))
            snappedXGuide = true
          }
        }
      }

      x = Math.min(left, right)
      y = Math.min(top, bottom)
      width = Math.max(1, Math.abs(right - left))
      height = Math.max(1, Math.abs(bottom - top))

      x = Math.max(0, Math.min(sourceW - width, x))
      y = Math.max(0, Math.min(sourceH - height, y))

      // Alt/mirror snapping is applied directly on the grabbed edge above before projection.
    }

    const nextGuides = { x: snappedXGuide, y: snappedYGuide }
    setSnapGuides((prev) => (prev.x === nextGuides.x && prev.y === nextGuides.y ? prev : nextGuides))

    setCrop({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) })
  }, [dragMode, crop, setCrop, sourceW, sourceH, contentRect, centerX, centerY, snapZoneX, snapZoneY, toSource])

  const finishDrag = useCallback((allowClickToggle: boolean, pointerId?: number) => {
    if (dragPointerId.current !== null && pointerId !== undefined && pointerId !== dragPointerId.current) {
      return
    }

    if (allowClickToggle && dragMode === 'create' && !movedEnough.current) {
      const video = videoRef.current
      if (video) {
        if (video.paused) video.play()
        else video.pause()
      }
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
    setSnapGuides((prev) => (prev.x || prev.y ? { x: false, y: false } : prev))
    dragStart.current = null
    createOrigin.current = null
    movedEnough.current = false
    dragPointerId.current = null
  }, [dragMode, videoRef])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragPointerId.current !== null && e.pointerId !== dragPointerId.current) return
    applyDrag(e.clientX, e.clientY, e.shiftKey, e.altKey)
  }, [applyDrag])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    finishDrag(true, e.pointerId)
  }, [finishDrag])

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    finishDrag(false, e.pointerId)
  }, [finishDrag])

  useEffect(() => {
    if (!dragMode) return

    const onWindowPointerMove = (e: PointerEvent) => {
      if (dragPointerId.current !== null && e.pointerId !== dragPointerId.current) return
      applyDrag(e.clientX, e.clientY, e.shiftKey, e.altKey)
    }

    const onWindowPointerUp = (e: PointerEvent) => {
      finishDrag(true, e.pointerId)
    }

    const onWindowPointerCancel = (e: PointerEvent) => {
      finishDrag(false, e.pointerId)
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

  const left = crop ? (crop.x / sourceW) * 100 : 0
  const top = crop ? (crop.y / sourceH) * 100 : 0
  const width = crop ? (crop.width / sourceW) * 100 : 0
  const height = crop ? (crop.height / sourceH) * 100 : 0

  const CLEAR_BUTTON_OUTSET = 28
  const cropLeftPx = crop ? (crop.x / sourceW) * contentRect.width : 0
  const cropTopPx = crop ? (crop.y / sourceH) * contentRect.height : 0
  const cropRightPx = crop ? cropLeftPx + (crop.width / sourceW) * contentRect.width : 0
  const clampClearXInside = cropRightPx + CLEAR_BUTTON_OUTSET > contentRect.width
  const clampClearYInside = cropTopPx < CLEAR_BUTTON_OUTSET

  const snapXActive = dragMode !== null && snapGuides.x
  const snapYActive = dragMode !== null && snapGuides.y

  const edgeHandleClass = 'absolute z-20 opacity-0 pointer-events-auto focus:opacity-100 focus:outline-2 focus:outline-offset-1 focus:outline-white focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white'
  const cornerHandleClass = 'absolute z-30 h-5 w-5 opacity-0 pointer-events-auto focus:opacity-100 focus:outline-2 focus:outline-offset-1 focus:outline-white focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white'

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
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

        {!crop && (
          <div
            className="absolute inset-0 pointer-events-auto"
            onPointerDown={onCreatePointerDown}
            aria-label="Create crop region"
          />
        )}

        {/* dark mask - single shadow mask avoids subpixel seams during drag */}
        {crop && <div className="absolute inset-0 pointer-events-none overflow-hidden">
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
        </div>}

        {/* crop rectangle border is pass-through; handles remain interactive. */}
        {crop && <div
          className="absolute pointer-events-none"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: `${width}%`,
            height: `${height}%`,
          }}
          onKeyDown={onKeyDown}
          tabIndex={0}
          role="group"
          aria-label={`Crop region ${crop.width}×${crop.height} at ${crop.x},${crop.y}. Arrow keys to move, Shift+arrows to resize.`}
        >
          <div className="absolute left-[2px] right-[2px] top-0 h-[3px] pointer-events-none bg-[length:30px_3px] bg-repeat-x" style={{ backgroundImage: 'linear-gradient(to right, var(--wasmux-accent) 0 20px, transparent 20px 30px)' }} aria-hidden="true" />
          <div className="absolute left-[2px] right-[2px] bottom-0 h-[3px] pointer-events-none bg-[length:30px_3px] bg-repeat-x" style={{ backgroundImage: 'linear-gradient(to right, var(--wasmux-accent) 0 20px, transparent 20px 30px)' }} aria-hidden="true" />
          <div className="absolute top-[2px] bottom-[2px] left-0 w-[3px] pointer-events-none bg-[length:3px_30px] bg-repeat-y" style={{ backgroundImage: 'linear-gradient(to bottom, var(--wasmux-accent) 0 20px, transparent 20px 30px)' }} aria-hidden="true" />
          <div className="absolute top-[2px] bottom-[2px] right-0 w-[3px] pointer-events-none bg-[length:3px_30px] bg-repeat-y" style={{ backgroundImage: 'linear-gradient(to bottom, var(--wasmux-accent) 0 20px, transparent 20px 30px)' }} aria-hidden="true" />

          <div
            className="absolute inset-0 z-10 pointer-events-auto cursor-move"
            onPointerDown={(e) => onPointerDown(e, 'move')}
            aria-label="Move crop"
          />

          <DangerXButton
            label="Clear crop (Esc)"
            className="absolute z-40 pointer-events-auto"
            style={{
              right: clampClearXInside ? '0px' : `-${CLEAR_BUTTON_OUTSET}px`,
              top: clampClearYInside ? '0px' : `-${CLEAR_BUTTON_OUTSET}px`,
            }}
            onPointerDown={(e) => { e.stopPropagation() }}
            onClick={(e) => { e.stopPropagation(); setCrop(null) }}
          />

          <div className={`${cornerHandleClass} left-0 top-0 cursor-nw-resize`} onPointerDown={(e) => onPointerDown(e, 'nw')} role="button" aria-label="Resize crop from top-left corner" />
          <div className={`${cornerHandleClass} right-0 top-0 cursor-ne-resize`} onPointerDown={(e) => onPointerDown(e, 'ne')} role="button" aria-label="Resize crop from top-right corner" />
          <div className={`${cornerHandleClass} left-0 bottom-0 cursor-sw-resize`} onPointerDown={(e) => onPointerDown(e, 'sw')} role="button" aria-label="Resize crop from bottom-left corner" />
          <div className={`${cornerHandleClass} right-0 bottom-0 cursor-se-resize`} onPointerDown={(e) => onPointerDown(e, 'se')} role="button" aria-label="Resize crop from bottom-right corner" />

          <div className={`${edgeHandleClass} left-3 right-3 top-0 h-3 cursor-n-resize`} onPointerDown={(e) => onPointerDown(e, 'n')} role="button" aria-label="Resize crop from top edge" />
          <div className={`${edgeHandleClass} left-3 right-3 bottom-0 h-3 cursor-s-resize`} onPointerDown={(e) => onPointerDown(e, 's')} role="button" aria-label="Resize crop from bottom edge" />
          <div className={`${edgeHandleClass} top-3 bottom-3 left-0 w-3 cursor-w-resize`} onPointerDown={(e) => onPointerDown(e, 'w')} role="button" aria-label="Resize crop from left edge" />
          <div className={`${edgeHandleClass} top-3 bottom-3 right-0 w-3 cursor-e-resize`} onPointerDown={(e) => onPointerDown(e, 'e')} role="button" aria-label="Resize crop from right edge" />
        </div>}
      </div>
    </div>
  )
}
