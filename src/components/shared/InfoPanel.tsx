/** modal showing app info, runtime status, and memory telemetry. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { DangerXButton } from '@/components/shared/DangerXButton'
import { lockFocusedInputWheelScroll } from '@/lib/domUtils'
import { useMemoryTelemetryStore, type MemorySample } from '@/stores/memoryTelemetryStore'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const APP_NAME = 'wasmux'
const REPO_URL = import.meta.env.VITE_REPO_URL ?? 'https://github.com/just-ero/wasmux'
const DEFAULT_SAMPLE_MS = 0
const WINDOW_MS = 60_000
const FONT_MEDIUM = '1rem'
const FONT_SMALL = '0.875rem'
const CLICKABLE_LINK_STYLE = 'text-accent font-semibold italic hover:underline decoration-[1.5px] underline-offset-2'
const MAJOR_TICK_SEQUENCE = [4, 8, 16, 24, 32, 48, 64, 96, 128, 256, 384, 512, 1024] as const
const GRAPH_LEFT_GUTTER = 40
const GRAPH_TOP_GUTTER = 8

function formatMiB(value: number): string {
  return `${Math.round(value)} MiB`
}

function clampSamplingMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SAMPLE_MS
  if (value <= 0) return 0
  return Math.max(20, Math.min(10_000, Math.round(value)))
}

function buildMajorTicks(yMax: number): number[] {
  if (yMax <= 0) return []
  const ticks: number[] = []

  for (const value of MAJOR_TICK_SEQUENCE) {
    if (value > yMax) break
    ticks.push(value)
  }

  if (ticks.length === 0) ticks.push(4)

  let tail = ticks[ticks.length - 1]
  while (tail < yMax) {
    tail += 512
    if (tail <= yMax) ticks.push(tail)
  }

  return ticks
}

function buildMinorGridTicks(yMax: number, majorTicks: number[]): number[] {
  if (yMax <= 0) return []

  // Keep grid density readable by targeting roughly 8-10 guides across the chart.
  const targetLines = 9
  const minimumStep = yMax / targetLines
  const niceSteps = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048] as const
  let step = niceSteps.find((candidate) => candidate >= minimumStep) ?? Math.max(512, Math.ceil(minimumStep / 512) * 512)

  // Preserve extra precision at smaller scales while still avoiding overdraw.
  if (yMax <= 64) step = 4
  if (yMax <= 32) step = 2

  const majorSet = new Set(majorTicks)
  const ticks: number[] = []
  for (let value = step; value <= yMax; value += step) {
    if (!majorSet.has(value)) ticks.push(value)
  }
  return ticks
}

function buildPolyline(
  samples: MemorySample[],
  valueKey: 'usedMiB' | 'allocatedMiB',
  yMax: number,
  width: number,
  height: number,
  windowStart: number,
  windowEnd: number,
): string {
  if (samples.length === 0 || yMax <= 0) return ''

  const span = Math.max(1, windowEnd - windowStart)

  return samples
    .map((sample) => {
      const ratio = (sample.t - windowStart) / span
      const x = Math.max(0, Math.min(width, ratio * width))
      const clamped = Math.max(0, Math.min(sample[valueKey], yMax))
      const y = height - (clamped / yMax) * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function resolveCombinedChartMax(samples: MemorySample[]): number {
  if (samples.length === 0) return 0
  const peak = samples.reduce((max, sample) => Math.max(max, sample.usedMiB, sample.allocatedMiB), 0)
  const majorTicks = buildMajorTicks(4096)
  const ceiling = majorTicks.find((tick) => tick >= peak) ?? 4096
  return Math.min(4096, ceiling)
}

function nearestSampleAtTime(samples: MemorySample[], targetT: number): MemorySample | null {
  if (samples.length === 0) return null
  let nearest = samples[0]
  let bestDistance = Math.abs(nearest.t - targetT)
  for (let i = 1; i < samples.length; i += 1) {
    const distance = Math.abs(samples[i].t - targetT)
    if (distance < bestDistance) {
      nearest = samples[i]
      bestDistance = distance
    }
  }
  return nearest
}

function getInnerGraphPosition(
  svg: SVGSVGElement,
  chartWidth: number,
  chartHeight: number,
  eventClientX: number,
  eventClientY: number,
): { x: number; y: number } {
  let svgX = GRAPH_LEFT_GUTTER
  let svgY = GRAPH_TOP_GUTTER

  const ctm = svg.getScreenCTM()
  if (ctm) {
    const pt = svg.createSVGPoint()
    pt.x = eventClientX
    pt.y = eventClientY
    const local = pt.matrixTransform(ctm.inverse())
    svgX = local.x
    svgY = local.y
  }

  const innerX = Math.max(0, Math.min(chartWidth, svgX - GRAPH_LEFT_GUTTER))
  const innerY = Math.max(0, Math.min(chartHeight, svgY - GRAPH_TOP_GUTTER))
  return { x: innerX, y: innerY }
}

export function InfoPanel({ isOpen, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const samplingInputRef = useRef<HTMLInputElement>(null)
  const keepSamplingInputEmptyRef = useRef(false)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const [now, setNow] = useState<number>(Date.now())
  const [samplingInput, setSamplingInput] = useState<string>(String(DEFAULT_SAMPLE_MS))
  const [hoveredSample, setHoveredSample] = useState<MemorySample | null>(null)
  const [hoveredSeries, setHoveredSeries] = useState<'used' | 'allocated' | null>(null)

  const samples = useMemoryTelemetryStore((s) => s.samples)
  const samplingMs = useMemoryTelemetryStore((s) => s.samplingMs)
  const hasSamplingPreference = useMemoryTelemetryStore((s) => s.hasSamplingPreference)
  const memorySource = useMemoryTelemetryStore((s) => s.source)
  const peakUsedMiB = useMemoryTelemetryStore((s) => s.peakUsedMiB)
  const peakAllocatedMiB = useMemoryTelemetryStore((s) => s.peakAllocatedMiB)
  const setSamplingMs = useMemoryTelemetryStore((s) => s.setSamplingMs)
  const unsetSamplingMs = useMemoryTelemetryStore((s) => s.unsetSamplingMs)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (keepSamplingInputEmptyRef.current && samplingMs === 0) {
      keepSamplingInputEmptyRef.current = false
      return
    }
    if (samplingMs === 0 && !hasSamplingPreference) {
      setSamplingInput('')
      return
    }
    setSamplingInput(String(samplingMs))
  }, [hasSamplingPreference, samplingMs])

  useEffect(() => {
    if (!samplingInputRef.current) return
    return lockFocusedInputWheelScroll(samplingInputRef.current)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
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
    window.addEventListener('keydown', onKey)

    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKey)
      previouslyFocusedRef.current?.focus()
    }
  }, [isOpen, onClose])

  const windowStart = now - WINDOW_MS
  const visibleSamples = useMemo(
    () => samples.filter((sample) => sample.t >= windowStart && sample.t <= now),
    [now, samples, windowStart],
  )
  const latest = visibleSamples.length > 0 ? visibleSamples[visibleSamples.length - 1] : null
  const yMax = useMemo(() => resolveCombinedChartMax(visibleSamples), [visibleSamples])
  const chartWidth = 660
  const chartHeight = 120
  const usedPoints = useMemo(
    () => buildPolyline(visibleSamples, 'usedMiB', yMax, chartWidth, chartHeight, windowStart, now),
    [visibleSamples, yMax, windowStart, now],
  )
  const allocatedPoints = useMemo(
    () => buildPolyline(visibleSamples, 'allocatedMiB', yMax, chartWidth, chartHeight, windowStart, now),
    [visibleSamples, yMax, windowStart, now],
  )
  const yTicks = useMemo(() => {
    if (yMax <= 0) return []
    const ticks = buildMajorTicks(yMax)
    const labelStartIndex = Math.max(0, ticks.length - 3)
    return ticks.map((value, index) => ({
      value,
      showLabel: index >= labelStartIndex,
      y: chartHeight - (value / yMax) * chartHeight,
    }))
  }, [yMax])
  const minorTicks = useMemo(() => {
    if (yMax <= 0) return []
    const majorTicks = buildMajorTicks(yMax)
    return buildMinorGridTicks(yMax, majorTicks).map((value) => ({
      value,
      y: chartHeight - (value / yMax) * chartHeight,
    }))
  }, [yMax])

  const handleSamplingInputChange = (raw: string) => {
    setSamplingInput(raw)
  }

  const commitSamplingInput = () => {
    if (samplingInput.trim() === '') {
      keepSamplingInputEmptyRef.current = true
      unsetSamplingMs()
      setSamplingInput('')
      return
    }
    const parsed = Number(samplingInput)
    if (!Number.isFinite(parsed)) {
      setSamplingInput(String(samplingMs))
      return
    }
    const next = clampSamplingMs(parsed)
    setSamplingMs(next)
    setSamplingInput(String(next))
  }

  const handleSamplingWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    if (document.activeElement !== e.currentTarget) return
    e.stopPropagation()

    const current = samplingInput.trim() === '' ? DEFAULT_SAMPLE_MS : Number(samplingInput)
    const safeCurrent = Number.isFinite(current) ? clampSamplingMs(current) : DEFAULT_SAMPLE_MS
    const step = safeCurrent >= 500 ? 50 : 20
    const next = Math.max(0, safeCurrent + (e.deltaY < 0 ? step : -step))
    const normalized = clampSamplingMs(next)
    setSamplingInput(String(normalized))
    setSamplingMs(normalized)
  }

  const handleChartMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const { x: innerX, y: innerY } = getInnerGraphPosition(e.currentTarget, chartWidth, chartHeight, e.clientX, e.clientY)
    const ratio = innerX / chartWidth
    const targetT = windowStart + ratio * WINDOW_MS
    const sample = nearestSampleAtTime(visibleSamples, targetT)
    setHoveredSample(sample)

    if (!sample || yMax <= 0) {
      setHoveredSeries(null)
      return
    }

    const usedY = chartHeight - (Math.max(0, Math.min(sample.usedMiB, yMax)) / yMax) * chartHeight
    const allocatedY = chartHeight - (Math.max(0, Math.min(sample.allocatedMiB, yMax)) / yMax) * chartHeight
    const usedDistance = Math.abs(innerY - usedY)
    const allocatedDistance = Math.abs(innerY - allocatedY)
    setHoveredSeries(usedDistance <= allocatedDistance ? 'used' : 'allocated')
  }

  const handleChartTouch = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 0) return
    const touch = e.touches[0]
    const { x: innerX, y: innerY } = getInnerGraphPosition(e.currentTarget, chartWidth, chartHeight, touch.clientX, touch.clientY)
    const ratio = innerX / chartWidth
    const targetT = windowStart + ratio * WINDOW_MS
    const sample = nearestSampleAtTime(visibleSamples, targetT)
    setHoveredSample(sample)

    if (!sample || yMax <= 0) {
      setHoveredSeries(null)
      return
    }

    const usedY = chartHeight - (Math.max(0, Math.min(sample.usedMiB, yMax)) / yMax) * chartHeight
    const allocatedY = chartHeight - (Math.max(0, Math.min(sample.allocatedMiB, yMax)) / yMax) * chartHeight
    const usedDistance = Math.abs(innerY - usedY)
    const allocatedDistance = Math.abs(innerY - allocatedY)
    setHoveredSeries(usedDistance <= allocatedDistance ? 'used' : 'allocated')
  }

  const handleChartLeave = () => {
    setHoveredSample(null)
    setHoveredSeries(null)
  }

  const handleChartTouchEnd = () => {
    setHoveredSample(null)
    setHoveredSeries(null)
  }

  const hoverLineX = hoveredSample
    ? Math.max(0, Math.min(chartWidth, ((hoveredSample.t - windowStart) / WINDOW_MS) * chartWidth))
    : null
  const hoverUsedY = hoveredSample && yMax > 0 ? chartHeight - (Math.max(0, Math.min(hoveredSample.usedMiB, yMax)) / yMax) * chartHeight : null
  const hoverAllocatedY = hoveredSample && yMax > 0 ? chartHeight - (Math.max(0, Math.min(hoveredSample.allocatedMiB, yMax)) / yMax) * chartHeight : null
  const selectedSample = hoveredSample ?? latest
  const selectedUsedY = selectedSample && yMax > 0
    ? chartHeight - (Math.max(0, Math.min(selectedSample.usedMiB, yMax)) / yMax) * chartHeight
    : null
  const selectedAllocatedY = selectedSample && yMax > 0
    ? chartHeight - (Math.max(0, Math.min(selectedSample.allocatedMiB, yMax)) / yMax) * chartHeight
    : null
  const labelMinY = 8
  const labelMaxY = chartHeight + 8
  const minLabelGap = 18
  let usedLabelY = selectedUsedY === null ? null : (8 + selectedUsedY)
  let allocatedLabelY = selectedAllocatedY === null ? null : (8 + selectedAllocatedY)

  if (usedLabelY !== null && allocatedLabelY !== null) {
    if (Math.abs(usedLabelY - allocatedLabelY) < minLabelGap) {
      if (usedLabelY <= allocatedLabelY) {
        usedLabelY -= minLabelGap / 2
        allocatedLabelY += minLabelGap / 2
      } else {
        usedLabelY += minLabelGap / 2
        allocatedLabelY -= minLabelGap / 2
      }
    }

    usedLabelY = Math.max(labelMinY, Math.min(labelMaxY, usedLabelY))
    allocatedLabelY = Math.max(labelMinY, Math.min(labelMaxY, allocatedLabelY))

    if (Math.abs(usedLabelY - allocatedLabelY) < minLabelGap) {
      if (usedLabelY <= allocatedLabelY) {
        allocatedLabelY = Math.min(labelMaxY, usedLabelY + minLabelGap)
        usedLabelY = Math.max(labelMinY, allocatedLabelY - minLabelGap)
      } else {
        usedLabelY = Math.min(labelMaxY, allocatedLabelY + minLabelGap)
        allocatedLabelY = Math.max(labelMinY, usedLabelY - minLabelGap)
      }
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center"
      style={{ padding: 'calc(var(--wasmux-edge-space) * 2)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-panel-title"
        className="bg-bg-raised rounded-lg shadow-lg max-w-3xl w-full max-h-[80vh] overflow-y-auto border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 bg-bg-raised border-b border-border flex items-center justify-between"
          style={{ padding: 'calc(var(--wasmux-edge-space) * 2)' }}
        >
          <h2 id="info-panel-title" className="text-lg font-semibold">Info Panel</h2>
          <DangerXButton ref={closeButtonRef} label="Close (Esc)" onClick={onClose} />
        </div>

        <div className="space-y-5" style={{ padding: 'calc(var(--wasmux-edge-space) * 3)' }}>
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-border p-3">
              <p className="text-text-muted">App</p>
              <p className="font-semibold">{APP_NAME} v{__APP_VERSION__}</p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-text-muted">Repository</p>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className={`${CLICKABLE_LINK_STYLE} break-all`}>{REPO_URL}</a>
            </div>
          </section>

          <section className="rounded border border-border p-3 text-sm space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Heap Memory ({latest ? formatMiB(latest.limitMiB) : 'n/a'})</h3>
              <div className="flex items-center gap-2">
                <label htmlFor="sampling-ms" className="text-text-muted tabular-nums">sample ms</label>
                <input
                  ref={samplingInputRef}
                  id="sampling-ms"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={String(DEFAULT_SAMPLE_MS)}
                  title="Sampling interval in milliseconds. Mouse wheel changes by 20ms (or 50ms above 500ms). Set 0 to turn sampling off."
                  value={samplingInput}
                  onChange={(e) => handleSamplingInputChange(e.target.value)}
                  onBlur={commitSamplingInput}
                  onWheel={handleSamplingWheel}
                  className="w-24 rounded border border-border bg-bg px-2 py-1 tabular-nums"
                />
              </div>
            </div>

            {latest ? (
              <>
                <div className="flex items-start gap-2">
                    <svg
                      viewBox={`0 0 ${chartWidth + GRAPH_LEFT_GUTTER + 8} ${chartHeight + 22}`}
                      className="flex-1 h-36 min-w-0"
                      role="img"
                      aria-label="JS heap used and allocated over time"
                      style={{ touchAction: 'none' }}
                      onMouseMove={handleChartMouseMove}
                      onMouseLeave={handleChartLeave}
                      onTouchStart={handleChartTouch}
                      onTouchMove={handleChartTouch}
                      onTouchEnd={handleChartTouchEnd}
                      onTouchCancel={handleChartTouchEnd}
                    >
                      <g transform={`translate(${GRAPH_LEFT_GUTTER},${GRAPH_TOP_GUTTER})`}>
                        {minorTicks.map((tick) => (
                          <line key={`minor-${tick.value}`} x1="0" y1={tick.y} x2={chartWidth} y2={tick.y} stroke="currentColor" opacity="0.08" />
                        ))}
                        {yTicks.map((tick) => (
                          <g key={tick.value}>
                            <line x1="0" y1={tick.y} x2={chartWidth} y2={tick.y} stroke="currentColor" opacity="0.2" />
                            {tick.showLabel && (
                              <text x="-8" y={tick.y + 5} textAnchor="end" fontSize={FONT_SMALL} fill="currentColor" opacity="0.85">
                                {tick.value}
                              </text>
                            )}
                          </g>
                        ))}
                        <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="currentColor" opacity="0.28" />
                        <polyline
                          fill="none"
                          stroke="var(--wasmux-accent)"
                          strokeWidth="2"
                          points={usedPoints}
                        />
                        <polyline
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="2"
                          points={allocatedPoints}
                        />
                        {hoverLineX !== null && <line x1={hoverLineX} y1="0" x2={hoverLineX} y2={chartHeight} stroke="currentColor" opacity="0.35" />}
                        {hoverLineX !== null && hoveredSeries === 'used' && hoverUsedY !== null && <circle cx={hoverLineX} cy={hoverUsedY} r="3" fill="var(--wasmux-accent)" />}
                        {hoverLineX !== null && hoveredSeries === 'allocated' && hoverAllocatedY !== null && <circle cx={hoverLineX} cy={hoverAllocatedY} r="3" fill="#ffffff" />}
                      </g>
                        {!hoveredSample && (
                          <>
                            <text x={GRAPH_LEFT_GUTTER} y={chartHeight + 18} fontSize={FONT_SMALL} fill="currentColor" opacity="0.85">-60.0s</text>
                            <text x={GRAPH_LEFT_GUTTER + chartWidth} y={chartHeight + 18} textAnchor="end" fontSize={FONT_SMALL} fill="currentColor" opacity="0.85">now</text>
                          </>
                        )}
                        {hoveredSample && hoverLineX !== null && (
                          <text
                            x={GRAPH_LEFT_GUTTER + hoverLineX}
                            y={chartHeight + 18}
                            textAnchor="middle"
                            fontSize={FONT_SMALL}
                            fill="currentColor"
                            opacity="0.95"
                          >
                            -{(Math.max(0, now - hoveredSample.t) / 1000).toFixed(1)}s
                          </text>
                        )}
                    </svg>

                      <aside className="w-20 shrink-0 tabular-nums relative h-36" style={{ fontSize: FONT_SMALL }}>
                        {usedLabelY !== null && selectedSample && (
                          <p
                            className="absolute font-semibold text-accent whitespace-nowrap"
                            style={{
                              top: `${usedLabelY}px`,
                              left: '0',
                              transform: 'translateY(-50%)',
                              fontSize: FONT_MEDIUM,
                            }}
                          >
                            {formatMiB(selectedSample.usedMiB)}
                          </p>
                        )}

                        {allocatedLabelY !== null && selectedSample && (
                          <p
                            className="absolute font-semibold whitespace-nowrap"
                            style={{
                              top: `${allocatedLabelY}px`,
                              left: '0',
                              transform: 'translateY(-50%)',
                              fontSize: FONT_MEDIUM,
                            }}
                          >
                            {formatMiB(selectedSample.allocatedMiB)}
                          </p>
                        )}
                    </aside>
                </div>

                  <p className="text-text-muted" style={{ fontSize: FONT_SMALL }}>
                    source: {memorySource}, peak used: <span className="font-semibold text-accent">{formatMiB(peakUsedMiB)}</span>, peak allocated:{' '}
                    <span className="font-semibold text-white">{formatMiB(peakAllocatedMiB)}</span>
                  </p>
              </>
            ) : (
              <p className="text-text-muted">
                {memorySource === 'off'
                  ? 'Sampling is disabled (set sample ms above 0 to resume).'
                  : 'Live heap telemetry is unavailable in this browser context.'}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
