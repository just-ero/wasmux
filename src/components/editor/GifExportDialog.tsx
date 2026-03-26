import { useEffect, useMemo, useRef, useState } from 'react'
import { DangerXButton } from '@/components/shared/DangerXButton'
import * as Icons from '@/components/shared/Icons'

interface GifExportDialogProps {
  isOpen: boolean
  sourceFps: number
  maxWidth: number
  maxHeight: number
  aspectRatio: number
  initialFps: number | null
  initialWidth: number | null
  initialHeight: number | null
  initialKeepAspectRatio: boolean
  onCancel: () => void
  onConfirm: (options: {
    gifFps: number
    gifWidth: number | null
    gifHeight: number | null
    keepAspectRatio: boolean
  }) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function GifExportDialog({
  isOpen,
  sourceFps,
  maxWidth,
  maxHeight,
  aspectRatio,
  initialFps,
  initialWidth,
  initialHeight,
  initialKeepAspectRatio,
  onCancel,
  onConfirm,
}: GifExportDialogProps) {
  const dialogRef = useRef<HTMLFormElement>(null)
  const fpsInputRef = useRef<HTMLInputElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const maxFps = useMemo(() => {
    if (sourceFps > 0) return Math.max(1, Math.floor(sourceFps))
    return 60
  }, [sourceFps])
  const fpsFieldCh = `max. ${maxFps}`.length
  const sizeFieldCh = `max. ${Math.max(maxWidth, maxHeight)}`.length

  const [fpsValue, setFpsValue] = useState(8)
  const [widthValue, setWidthValue] = useState<number | ''>('')
  const [heightValue, setHeightValue] = useState<number | ''>('')
  const [keepAspectRatio, setKeepAspectRatio] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    const suggestedFps = initialFps && initialFps > 0 ? initialFps : maxFps
    setFpsValue(clamp(Math.round(suggestedFps), 1, maxFps))
    setWidthValue(initialWidth && initialWidth > 0 ? clamp(initialWidth, 1, maxWidth) : '')
    setHeightValue(initialHeight && initialHeight > 0 ? clamp(initialHeight, 1, maxHeight) : '')
    setKeepAspectRatio(initialKeepAspectRatio)
  }, [isOpen, initialFps, initialWidth, initialHeight, initialKeepAspectRatio, maxFps, maxWidth, maxHeight])

  useEffect(() => {
    if (!isOpen) return

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusTimer = window.setTimeout(() => fpsInputRef.current?.focus(), 0)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab') return

      const dialogEl = dialogRef.current
      if (!dialogEl) return

      const focusables = Array.from(
        dialogEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0)

      if (focusables.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement

      if (e.shiftKey) {
        if (active === first || !dialogEl.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !dialogEl.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocusedRef.current?.focus()
    }
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const nextHeightFromWidth = (width: number) => clamp(Math.round(width / aspectRatio), 1, maxHeight)
  const nextWidthFromHeight = (height: number) => clamp(Math.round(height * aspectRatio), 1, maxWidth)

  const handleFpsChange = (value: string) => {
    if (!value) return
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed)) return
    setFpsValue(clamp(parsed, 1, maxFps))
  }

  const handleWidthChange = (value: string) => {
    if (value === '') {
      setWidthValue('')
      return
    }
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    const width = clamp(parsed, 1, maxWidth)
    setWidthValue(width)
    if (keepAspectRatio) {
      setHeightValue(nextHeightFromWidth(width))
    }
  }

  const handleHeightChange = (value: string) => {
    if (value === '') {
      setHeightValue('')
      return
    }
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    const height = clamp(parsed, 1, maxHeight)
    setHeightValue(height)
    if (keepAspectRatio) {
      setWidthValue(nextWidthFromHeight(height))
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    let gifWidth = widthValue === '' ? null : widthValue
    let gifHeight = heightValue === '' ? null : heightValue

    if (keepAspectRatio) {
      if (gifWidth !== null && gifHeight === null) gifHeight = nextHeightFromWidth(gifWidth)
      if (gifHeight !== null && gifWidth === null) gifWidth = nextWidthFromHeight(gifHeight)
    }

    onConfirm({ gifFps: fpsValue, gifWidth, gifHeight, keepAspectRatio })
  }

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center"
      style={{ padding: 'calc(var(--wasmux-edge-space) * 2)' }}
      onClick={onCancel}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gif-export-dialog-title"
        className="w-fit max-w-[92vw] bg-bg-raised border border-border rounded-lg shadow-lg flex flex-col"
        style={{ padding: 'var(--wasmux-edge-space)', gap: 'var(--wasmux-edge-space)' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="flex items-center justify-between">
          <h2 id="gif-export-dialog-title" className="text-[13px] font-semibold">gif export</h2>
          <DangerXButton label="Close GIF export" onClick={onCancel} />
        </div>

        <div
          className="grid grid-cols-[40px_auto] items-start text-[12px]"
          style={{ columnGap: 'var(--wasmux-edge-space)' }}
        >
          <span className="text-text-muted leading-7">fps</span>
          <div className="flex flex-col items-start gap-0.5">
            <input
              ref={fpsInputRef}
              type="number"
              min={1}
              max={maxFps}
              step={1}
              aria-label="FPS"
              className="control-field control-field-number"
              style={{ width: `max(5rem, ${fpsFieldCh}ch)` }}
              value={fpsValue}
              onChange={(e) => handleFpsChange(e.target.value)}
            />
            <span className="text-[11px] text-text-muted">max. {maxFps}</span>
          </div>
        </div>

        <div
          className="grid grid-cols-[40px_auto] items-start text-[12px]"
          style={{ columnGap: 'var(--wasmux-edge-space)' }}
        >
          <span className="text-text-muted leading-7">size</span>
          <div className="flex items-start" style={{ gap: 'var(--wasmux-edge-space)' }}>
            <div className="flex flex-col items-start gap-0.5">
              <input
                type="number"
                min={1}
                max={maxWidth}
                step={1}
                aria-label="GIF width"
                className="control-field control-field-number"
                style={{ width: `max(5rem, ${sizeFieldCh}ch)` }}
                value={widthValue}
                onChange={(e) => handleWidthChange(e.target.value)}
                placeholder="auto"
              />
              <span className="text-[11px] text-text-muted">max. {maxWidth}</span>
            </div>
            <span className="text-text-muted leading-7">x</span>
            <div className="flex flex-col items-start gap-0.5">
              <input
                type="number"
                min={1}
                max={maxHeight}
                step={1}
                aria-label="GIF height"
                className="control-field control-field-number"
                style={{ width: `max(5rem, ${sizeFieldCh}ch)` }}
                value={heightValue}
                onChange={(e) => handleHeightChange(e.target.value)}
                placeholder="auto"
              />
              <span className="text-[11px] text-text-muted">max. {maxHeight}</span>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const next = !keepAspectRatio
                setKeepAspectRatio(next)
                if (next && widthValue !== '' && heightValue === '') {
                  setHeightValue(nextHeightFromWidth(widthValue))
                }
                if (next && heightValue !== '' && widthValue === '') {
                  setWidthValue(nextWidthFromHeight(heightValue))
                }
              }}
              aria-label={keepAspectRatio ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
              title={keepAspectRatio ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
            >
              {keepAspectRatio ? <Icons.Link width={14} height={14} /> : <Icons.LinkOff width={14} height={14} />}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn w-auto px-2.5" aria-label="Export GIF" title="Export GIF">
            <Icons.Export width={14} height={14} />
          </button>
        </div>
      </form>
    </div>
  )
}
