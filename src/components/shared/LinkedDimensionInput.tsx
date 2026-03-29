/**
 * Figma-style linked width × height input.
 *
 * When linked, changing one value automatically derives the other
 * from the **source** aspect ratio (not the current pair of values).
 * The link button sits between the two fields and visually connects them.
 *
 * Wheel behaviour:
 *  - default       → ±1
 *  - shift held    → ±10
 *  - alt held      → ±1 (clamped to min 1)
 */

import { useCallback, useEffect, useRef } from 'react'
import * as Icons from '@/components/shared/Icons'
import { lockFocusedInputWheelScroll } from '@/lib/domUtils'

export interface LinkedDimensionInputProps {
  /** Current width value (null / undefined → empty). */
  width: number | null | undefined
  /** Current height value (null / undefined → empty). */
  height: number | null | undefined
  /** Whether the fields are linked (aspect-locked). */
  linked: boolean
  /** Source aspect ratio (width / height). Used when re-linking. */
  sourceAspect: number
  /** Placeholder text for the width field. */
  widthPlaceholder?: string
  /** Placeholder text for the height field. */
  heightPlaceholder?: string
  /** Min allowed value (default 1). */
  min?: number
  /** Max allowed width. */
  maxWidth?: number
  /** Max allowed height. */
  maxHeight?: number
  /** Called when width changes. Height may also be supplied when linked. */
  onWidthChange: (width: number | null, linkedHeight: number | null) => void
  /** Called when height changes. Width may also be supplied when linked. */
  onHeightChange: (height: number | null, linkedWidth: number | null) => void
  /** Called when the link button is toggled. */
  onLinkedChange: (linked: boolean) => void
  /** Source width (used to compute scale-factor-based scroll steps). */
  sourceWidth?: number
  /** Source height (used to compute scale-factor-based scroll steps). */
  sourceHeight?: number
  /** Aria label prefix, e.g. "Output" → "Output width". */
  ariaPrefix?: string
}

/** Pure function: compute the next pixel value after one scroll tick. */
export function scaleStep(
  current: number,
  sourceDim: number,
  up: boolean,
  min: number,
): number {
  const rawScale = current / sourceDim
  // Bucket by displayed precision (2 decimals) so 0.10 behaves like 0.10.
  const scale = Math.round(rawScale * 100) / 100
  const isOne = Math.abs(scale - 1) < 1e-9
  const isTenth = Math.abs(scale - 0.1) < 1e-9
  const delta = isOne
    ? (up ? 0.1 : 0.05)
    : isTenth
      ? (up ? 0.05 : 0.01)
      : scale > 1
        ? 0.1
        : scale > 0.1
          ? 0.05
          : 0.01
  const newScale = scale + (up ? delta : -delta)
  return Math.max(min, Math.round(newScale * sourceDim))
}

function clampOpt(v: number, min: number, max: number | undefined) {
  const lo = Math.max(min, v)
  return max !== undefined ? Math.min(lo, max) : lo
}

function deriveHeight(width: number, aspect: number, min: number, max?: number) {
  if (aspect <= 0) return null
  return clampOpt(Math.round(width / aspect), min, max)
}

function deriveWidth(height: number, aspect: number, min: number, max?: number) {
  if (aspect <= 0) return null
  return clampOpt(Math.round(height * aspect), min, max)
}

export function LinkedDimensionInput({
  width,
  height,
  linked,
  sourceAspect,
  widthPlaceholder,
  heightPlaceholder,
  min = 1,
  maxWidth,
  maxHeight,
  onWidthChange,
  onHeightChange,
  onLinkedChange,
  sourceWidth,
  sourceHeight,
  ariaPrefix = 'Output',
}: LinkedDimensionInputProps) {
  const widthRef = useRef<HTMLInputElement>(null)
  const heightRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const cleanups: Array<() => void> = []
    if (widthRef.current) cleanups.push(lockFocusedInputWheelScroll(widthRef.current))
    if (heightRef.current) cleanups.push(lockFocusedInputWheelScroll(heightRef.current))
    return () => {
      cleanups.forEach((fn) => fn())
    }
  }, [])

  const commitWidth = useCallback((raw: string) => {
    if (raw.trim() === '') {
      onWidthChange(null, linked ? null : undefined as unknown as null)
      return
    }
    const parsed = parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    const w = clampOpt(parsed, min, maxWidth)
    const h = linked ? deriveHeight(w, sourceAspect, min, maxHeight) : null
    onWidthChange(w, linked ? h : undefined as unknown as null)
  }, [linked, min, maxWidth, maxHeight, sourceAspect, onWidthChange])

  const commitHeight = useCallback((raw: string) => {
    if (raw.trim() === '') {
      onHeightChange(null, linked ? null : undefined as unknown as null)
      return
    }
    const parsed = parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    const h = clampOpt(parsed, min, maxHeight)
    const w = linked ? deriveWidth(h, sourceAspect, min, maxWidth) : null
    onHeightChange(h, linked ? w : undefined as unknown as null)
  }, [linked, min, maxWidth, maxHeight, sourceAspect, onHeightChange])

  const handleWheel = useCallback((
    e: React.WheelEvent<HTMLInputElement>,
    current: number | null | undefined,
    placeholder: string | undefined,
    sourceDim: number | undefined,
    commit: (raw: string) => void,
  ) => {
    if (document.activeElement !== e.currentTarget) return
    e.preventDefault()
    e.stopPropagation()
    const base = (current != null && current > 0) ? current : parseInt(placeholder ?? '0', 10) || 0
    const up = e.deltaY < 0
    let next: number
    if (sourceDim && sourceDim > 0) {
      next = scaleStep(base, sourceDim, up, min)
    } else {
      const step = e.shiftKey ? 10 : 1
      next = Math.max(min, base + (up ? step : -step))
    }
    commit(String(next))
  }, [min])

  const toggleLinked = useCallback(() => {
    const next = !linked
    onLinkedChange(next)
    if (next) {
      // Re-linking: derive height from width using source aspect ratio.
      const w = width != null && width > 0 ? width : null
      const h = height != null && height > 0 ? height : null
      if (w != null) {
        const derivedH = deriveHeight(w, sourceAspect, min, maxHeight)
        onWidthChange(w, derivedH)
      } else if (h != null) {
        const derivedW = deriveWidth(h, sourceAspect, min, maxWidth)
        onHeightChange(h, derivedW)
      }
    }
  }, [linked, width, height, sourceAspect, min, maxWidth, maxHeight, onLinkedChange, onWidthChange, onHeightChange])

  const linkTooltip = linked
    ? 'Aspect ratio locked to source. Click to unlock.'
    : 'Aspect ratio unlocked. Click to lock to source ratio.'

  return (
    <div className="linked-dim" data-linked={linked}>
      <input
        ref={widthRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`${ariaPrefix} width`}
        className="linked-dim-field tabular-nums"
        value={width ?? ''}
        placeholder={widthPlaceholder}
        onChange={(e) => commitWidth(e.target.value)}
        onWheel={(e) => handleWheel(e, width, widthPlaceholder, sourceWidth, commitWidth)}
      />
      <button
        type="button"
        className="linked-dim-link"
        data-linked={linked}
        onClick={toggleLinked}
        aria-label={linkTooltip}
        title={linkTooltip}
      >
        {linked
          ? <Icons.Link width={14} height={14} />
          : <Icons.LinkOff width={14} height={14} />}
      </button>
      <input
        ref={heightRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`${ariaPrefix} height`}
        className="linked-dim-field tabular-nums"
        value={height ?? ''}
        placeholder={heightPlaceholder}
        onChange={(e) => commitHeight(e.target.value)}
        onWheel={(e) => handleWheel(e, height, heightPlaceholder, sourceHeight, commitHeight)}
      />
    </div>
  )
}
