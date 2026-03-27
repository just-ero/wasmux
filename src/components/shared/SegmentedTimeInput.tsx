import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

type SegmentKind = 'h' | 'm' | 's' | 'ms'

interface SegmentSpec {
  kind: SegmentKind
  width: number
}

interface SegmentRanges {
  start: number
  end: number
}

interface Props {
  valueSeconds: number
  maxSeconds: number
  ariaLabel: string
  className?: string
  style?: CSSProperties
  onCommit: (seconds: number) => void
}

interface SegmentValues {
  h: number
  m: number
  s: number
  ms: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getSpecs(maxSeconds: number): SegmentSpec[] {
  if (maxSeconds >= 3600) {
    const maxHours = Math.max(0, Math.floor(maxSeconds / 3600))
    const hourWidth = Math.max(1, String(maxHours).length)
    return [{ kind: 'h', width: hourWidth }, { kind: 'm', width: 2 }, { kind: 's', width: 2 }, { kind: 'ms', width: 3 }]
  }
  if (maxSeconds >= 60) return [{ kind: 'm', width: 2 }, { kind: 's', width: 2 }, { kind: 'ms', width: 3 }]
  return [{ kind: 's', width: 2 }, { kind: 'ms', width: 3 }]
}

function toSegmentValues(seconds: number): SegmentValues {
  const clampedMs = Math.max(0, Math.round(seconds * 1000))
  const h = Math.floor(clampedMs / 3_600_000)
  const m = Math.floor((clampedMs % 3_600_000) / 60_000)
  const s = Math.floor((clampedMs % 60_000) / 1000)
  const ms = clampedMs % 1000
  return { h, m, s, ms }
}

function valuesToSeconds(values: SegmentValues, specs: SegmentSpec[], maxSeconds: number): number {
  const hasHours = specs.some((spec) => spec.kind === 'h')
  const hasMinutes = specs.some((spec) => spec.kind === 'm')

  const h = hasHours ? Math.max(0, values.h) : 0
  const m = hasMinutes ? Math.max(0, values.m) : 0
  const s = Math.max(0, values.s)
  const ms = Math.max(0, values.ms)

  const total = h * 3600 + m * 60 + s + ms / 1000
  return clamp(total, 0, Math.max(0, maxSeconds))
}

function formatText(values: SegmentValues, specs: SegmentSpec[]): string {
  const parts: string[] = []
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i]
    const raw = spec.kind === 'h' ? values.h : spec.kind === 'm' ? values.m : spec.kind === 's' ? values.s : values.ms
    const text = String(raw).padStart(spec.width, '0')
    parts.push(text)

    if (i < specs.length - 1) {
      const next = specs[i + 1]
      parts.push(next.kind === 'ms' ? '.' : ':')
    }
  }
  return parts.join('')
}

function buildRanges(specs: SegmentSpec[]): SegmentRanges[] {
  const ranges: SegmentRanges[] = []
  let cursor = 0
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i]
    const start = cursor
    const end = start + spec.width
    ranges.push({ start, end })
    cursor = end
    if (i < specs.length - 1) cursor += 1
  }
  return ranges
}

function segmentAtCaret(caret: number, ranges: SegmentRanges[]): number {
  for (let i = 0; i < ranges.length; i += 1) {
    const range = ranges[i]
    if (caret >= range.start && caret <= range.end) return i
  }
  return ranges.length - 1
}

export const SegmentedTimeInput = forwardRef<HTMLInputElement, Props>(function SegmentedTimeInput(
  { valueSeconds, maxSeconds, ariaLabel, className, style, onCommit },
  forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [activeSegment, setActiveSegment] = useState(0)
  const specs = useMemo(() => getSpecs(maxSeconds), [maxSeconds])
  const ranges = useMemo(() => buildRanges(specs), [specs])
  const [values, setValues] = useState<SegmentValues>(() => toSegmentValues(valueSeconds))
  const isFocusedRef = useRef(false)

  useEffect(() => {
    if (typeof forwardedRef === 'function') {
      forwardedRef(inputRef.current)
      return
    }
    if (forwardedRef) {
      forwardedRef.current = inputRef.current
    }
  }, [forwardedRef])

  useEffect(() => {
    if (isFocusedRef.current) return
    setValues(toSegmentValues(valueSeconds))
  }, [valueSeconds])

  const text = useMemo(() => formatText(values, specs), [values, specs])

  const selectSegment = useCallback((index: number) => {
    const input = inputRef.current
    if (!input) return
    const clampedIndex = clamp(index, 0, specs.length - 1)
    const range = ranges[clampedIndex]
    setActiveSegment(clampedIndex)
    requestAnimationFrame(() => {
      input.setSelectionRange(range.start, range.end)
    })
  }, [ranges, specs.length])

  const commit = useCallback((nextValues: SegmentValues) => {
    onCommit(valuesToSeconds(nextValues, specs, maxSeconds))
  }, [maxSeconds, onCommit, specs])

  const updateSegment = useCallback((index: number, updater: (current: number, width: number) => number) => {
    const spec = specs[index]
    setValues((prev) => {
      const current = spec.kind === 'h' ? prev.h : spec.kind === 'm' ? prev.m : spec.kind === 's' ? prev.s : prev.ms
      const maxForWidth = Math.pow(10, spec.width) - 1
      const nextRaw = clamp(updater(current, spec.width), 0, maxForWidth)
      const next = { ...prev }
      if (spec.kind === 'h') next.h = nextRaw
      else if (spec.kind === 'm') next.m = nextRaw
      else if (spec.kind === 's') next.s = nextRaw
      else next.ms = nextRaw
      return next
    })
  }, [specs])

  return (
    <input
      ref={inputRef}
      aria-label={ariaLabel}
      className={className}
      style={style}
      value={text}
      readOnly
      onFocus={() => {
        isFocusedRef.current = true
        selectSegment(activeSegment)
      }}
      onBlur={() => {
        isFocusedRef.current = false
        commit(values)
      }}
      onClick={(e) => {
        const caret = e.currentTarget.selectionStart ?? 0
        const index = segmentAtCaret(caret, ranges)
        selectSegment(index)
      }}
      onKeyDown={(e) => {
        const key = e.key

        if (key === 'Tab' && e.shiftKey) {
          e.preventDefault()
          selectSegment(activeSegment - 1)
          return
        }

        if (key === 'ArrowRight' || key === 'Enter' || key === 'Tab') {
          e.preventDefault()
          selectSegment(activeSegment + 1)
          return
        }

        if (key === 'ArrowLeft') {
          e.preventDefault()
          selectSegment(activeSegment - 1)
          return
        }

        if (key === 'Escape') {
          e.preventDefault()
          const reset = toSegmentValues(valueSeconds)
          setValues(reset)
          selectSegment(activeSegment)
          return
        }

        if (key === 'Backspace' || key === 'Delete') {
          e.preventDefault()
          updateSegment(activeSegment, () => 0)
          selectSegment(activeSegment)
          return
        }

        if (key === 'ArrowUp') {
          e.preventDefault()
          updateSegment(activeSegment, (current) => current + 1)
          selectSegment(activeSegment)
          return
        }

        if (key === 'ArrowDown') {
          e.preventDefault()
          updateSegment(activeSegment, (current) => current - 1)
          selectSegment(activeSegment)
          return
        }

        if (/^\d$/.test(key)) {
          e.preventDefault()
          const digit = Number.parseInt(key, 10)
          updateSegment(activeSegment, () => digit)
          selectSegment(activeSegment + 1)
        }
      }}
    />
  )
})
