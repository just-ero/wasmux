import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

type SegmentKind = 'h' | 'm' | 's' | 'ms'

interface SegmentSpec {
  kind: SegmentKind
  width: number
  max: number
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
  onCommit: (seconds: number) => number | void
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
    return [
      { kind: 'h', width: hourWidth, max: maxHours },
      { kind: 'm', width: 2, max: 59 },
      { kind: 's', width: 2, max: 59 },
      { kind: 'ms', width: 3, max: 999 },
    ]
  }
  if (maxSeconds >= 60) return [
    { kind: 'm', width: 2, max: 59 },
    { kind: 's', width: 2, max: 59 },
    { kind: 'ms', width: 3, max: 999 },
  ]
  return [
    { kind: 's', width: 2, max: 59 },
    { kind: 'ms', width: 3, max: 999 },
  ]
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

function formatTextWithDraft(
  values: SegmentValues,
  specs: SegmentSpec[],
  draft: { segment: number; text: string },
): string {
  const parts: string[] = []
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i]
    const raw = spec.kind === 'h' ? values.h : spec.kind === 'm' ? values.m : spec.kind === 's' ? values.s : values.ms
    let text = String(raw).padStart(spec.width, '0')

    if (draft.segment === i && draft.text.length > 0) {
      text = spec.kind === 'ms'
        ? draft.text.padEnd(spec.width, ' ')
        : draft.text.padStart(spec.width, ' ')
    }

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
    if (caret >= range.start && caret < range.end) return i
  }
  if (ranges.length > 0 && caret <= ranges[0].start) return 0
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
  const mouseFocusRef = useRef(false)
  const typedBufferRef = useRef<{ segment: number; text: string }>({ segment: -1, text: '' })
  const selectionRafRef = useRef<number | null>(null)

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

  const [draftVersion, setDraftVersion] = useState(0)
  const text = useMemo(
    () => formatTextWithDraft(values, specs, typedBufferRef.current),
    [values, specs, draftVersion],
  )

  const queueSelection = useCallback((start: number, end: number) => {
    const input = inputRef.current
    if (!input) return
    if (selectionRafRef.current !== null) {
      cancelAnimationFrame(selectionRafRef.current)
    }
    selectionRafRef.current = requestAnimationFrame(() => {
      input.setSelectionRange(start, end)
      selectionRafRef.current = null
    })
  }, [])

  useEffect(() => {
    return () => {
      if (selectionRafRef.current !== null) {
        cancelAnimationFrame(selectionRafRef.current)
      }
    }
  }, [])

  const selectSegment = useCallback((index: number) => {
    const input = inputRef.current
    if (!input) return
    const clampedIndex = clamp(index, 0, specs.length - 1)
    const range = ranges[clampedIndex]
    setActiveSegment(clampedIndex)
    queueSelection(range.start, range.end)
    typedBufferRef.current = { segment: -1, text: '' }
    setDraftVersion((v) => v + 1)
  }, [queueSelection, ranges, specs.length])

  const placeCaretAtSegmentEnd = useCallback((index: number) => {
    const input = inputRef.current
    if (!input) return
    const clampedIndex = clamp(index, 0, specs.length - 1)
    const range = ranges[clampedIndex]
    setActiveSegment(clampedIndex)
    queueSelection(range.end, range.end)
  }, [queueSelection, ranges, specs.length])

  const commit = useCallback((nextValues: SegmentValues) => {
    const inputSeconds = valuesToSeconds(nextValues, specs, maxSeconds)
    const committed = onCommit(inputSeconds)
    const canonicalSeconds = typeof committed === 'number' && Number.isFinite(committed)
      ? clamp(committed, 0, Math.max(0, maxSeconds))
      : inputSeconds
    setValues(toSegmentValues(canonicalSeconds))
  }, [maxSeconds, onCommit, specs])

  const applyDraftToValues = useCallback((base: SegmentValues): SegmentValues => {
    const draft = typedBufferRef.current
    if (draft.segment < 0 || draft.segment >= specs.length || draft.text.length === 0) return base

    const spec = specs[draft.segment]
    const padded = spec.kind === 'ms'
      ? draft.text.padEnd(spec.width, '0').slice(0, spec.width)
      : draft.text.padStart(spec.width, '0').slice(-spec.width)
    const parsed = Number.parseInt(padded, 10)
    const nextRaw = clamp(Number.isFinite(parsed) ? parsed : 0, 0, spec.max)

    const next = { ...base }
    if (spec.kind === 'h') next.h = nextRaw
    else if (spec.kind === 'm') next.m = nextRaw
    else if (spec.kind === 's') next.s = nextRaw
    else next.ms = nextRaw
    return next
  }, [specs])

  const commitDraft = useCallback((base: SegmentValues): SegmentValues => {
    const next = applyDraftToValues(base)
    typedBufferRef.current = { segment: -1, text: '' }
    setDraftVersion((v) => v + 1)
    setValues(next)
    return next
  }, [applyDraftToValues])

  const updateSegment = useCallback((index: number, updater: (current: number, width: number) => number) => {
    const spec = specs[index]
    setValues((prev) => {
      const current = spec.kind === 'h' ? prev.h : spec.kind === 'm' ? prev.m : spec.kind === 's' ? prev.s : prev.ms
      const maxForWidth = Math.pow(10, spec.width) - 1
      const nextRaw = clamp(updater(current, spec.width), 0, Math.min(maxForWidth, spec.max))
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
      onFocus={(e) => {
        isFocusedRef.current = true
        if (mouseFocusRef.current) return
        const caret = e.currentTarget.selectionStart ?? ranges[activeSegment]?.start ?? 0
        const index = segmentAtCaret(caret, ranges)
        selectSegment(index)
      }}
      onBlur={() => {
        isFocusedRef.current = false
        mouseFocusRef.current = false
        const committed = commitDraft(values)
        commit(committed)
      }}
      onMouseDown={() => {
        mouseFocusRef.current = true
      }}
      onMouseUp={(e) => {
        e.preventDefault()
        const caret = e.currentTarget.selectionStart ?? 0
        const index = segmentAtCaret(caret, ranges)
        commitDraft(values)
        selectSegment(index)
        mouseFocusRef.current = false
      }}
      onClick={(e) => {
        e.preventDefault()
      }}
      onPaste={(e) => {
        e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
      }}
      onBeforeInput={(e) => {
        e.preventDefault()
      }}
      onKeyDown={(e) => {
        const key = e.key

        if (key === 'Tab' && e.shiftKey) {
          e.preventDefault()
          commitDraft(values)
          selectSegment(activeSegment - 1)
          return
        }

        if (key === 'ArrowRight' || key === 'Enter' || key === 'Tab') {
          e.preventDefault()
          commitDraft(values)
          selectSegment(activeSegment + 1)
          return
        }

        if (key === 'ArrowLeft') {
          e.preventDefault()
          commitDraft(values)
          selectSegment(activeSegment - 1)
          return
        }

        if (key === 'Escape') {
          e.preventDefault()
          const reset = toSegmentValues(valueSeconds)
          setValues(reset)
          typedBufferRef.current = { segment: -1, text: '' }
          setDraftVersion((v) => v + 1)
          selectSegment(activeSegment)
          return
        }

        if (key === 'Backspace' || key === 'Delete') {
          e.preventDefault()
          typedBufferRef.current = { segment: -1, text: '' }
          setDraftVersion((v) => v + 1)
          updateSegment(activeSegment, () => 0)
          selectSegment(activeSegment)
          return
        }

        if (key === 'ArrowUp') {
          e.preventDefault()
          typedBufferRef.current = { segment: -1, text: '' }
          setDraftVersion((v) => v + 1)
          updateSegment(activeSegment, (current) => current + 1)
          selectSegment(activeSegment)
          return
        }

        if (key === 'ArrowDown') {
          e.preventDefault()
          typedBufferRef.current = { segment: -1, text: '' }
          setDraftVersion((v) => v + 1)
          updateSegment(activeSegment, (current) => current - 1)
          selectSegment(activeSegment)
          return
        }

        if (/^\d$/.test(key)) {
          e.preventDefault()
          const digit = Number.parseInt(key, 10)
          const spec = specs[activeSegment]
          const prev = typedBufferRef.current
          const base = prev.segment === activeSegment ? prev.text : ''
          const nextText = `${base}${digit}`.slice(0, spec.width)
          typedBufferRef.current = { segment: activeSegment, text: nextText }
          setDraftVersion((v) => v + 1)

          if (nextText.length >= spec.width) {
            commitDraft(values)
            selectSegment(activeSegment + 1)
          } else {
            placeCaretAtSegmentEnd(activeSegment)
          }
          return
        }
      }}
    />
  )
})
