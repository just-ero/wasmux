import type { RefObject } from 'react'

interface TrimRibbonVisualProps {
  inPct: number
  outPct: number
  collapsedSelection: boolean
  playheadPct?: number
  keyframePcts?: number[]
  showHandles?: boolean
  handleWidthPx?: number
  barRef?: RefObject<HTMLDivElement | null>
}

export function TrimRibbonVisual({
  inPct,
  outPct,
  collapsedSelection,
  playheadPct,
  keyframePcts = [],
  showHandles = true,
  handleWidthPx = 4,
  barRef,
}: TrimRibbonVisualProps) {
  const selWidth = outPct - inPct
  const accent = 'var(--wasmux-accent)'
  const subtle = 'var(--wasmux-text-muted)'

  return (
    <>
      <div ref={barRef} className="relative bg-bg-sunken rounded-sm" style={{ width: '100%', height: '100%', padding: 0, margin: 0, boxSizing: 'border-box' }}>
        <div
          className="absolute inset-0"
          style={{ backgroundColor: subtle, opacity: 0.45, padding: 0, margin: 0, boxSizing: 'border-box' }}
        />

        <div
          className="absolute top-0 bottom-0 z-10"
          style={{
            backgroundColor: accent,
            opacity: 0.7,
            ...(collapsedSelection
              ? { left: `calc(${inPct}% - 3px)`, width: '6px' }
              : { left: `${inPct}%`, width: `${selWidth}%` }),
          }}
        />

        {keyframePcts.map((pct, idx) => (
          <div
            key={`kf-${idx}-${pct.toFixed(4)}`}
            className="absolute bottom-0 w-px h-2"
            style={{ left: `${pct}%`, backgroundColor: subtle, opacity: 0.85 }}
          />
        ))}

        {typeof playheadPct === 'number' && (
          <div
            className="absolute top-0 bottom-0 z-20 pointer-events-none"
            style={{ left: `${playheadPct}%`, width: '2px', backgroundColor: 'var(--wasmux-text)' }}
          />
        )}
      </div>

      {showHandles && (
        <>
          <div
            className="absolute top-0 bottom-0 cursor-ew-resize z-10 opacity-100"
            style={{ left: `${inPct}%`, width: `${handleWidthPx}px`, transform: 'translateX(-50%)' }}
          >
            <div
              className="h-full w-full"
              style={{
                backgroundColor: accent,
                borderTopLeftRadius: '3px',
                borderBottomLeftRadius: '3px',
              }}
            />
          </div>

          <div
            className="absolute top-0 bottom-0 cursor-ew-resize z-10 opacity-100"
            style={{ left: `${outPct}%`, width: `${handleWidthPx}px`, transform: 'translateX(-50%)' }}
          >
            <div
              className="h-full w-full"
              style={{
                backgroundColor: accent,
                borderTopRightRadius: '3px',
                borderBottomRightRadius: '3px',
              }}
            />
          </div>
        </>
      )}
    </>
  )
}
