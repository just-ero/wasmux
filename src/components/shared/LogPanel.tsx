/**
 * logpanel.tsx - resizable log / job tree panel.
 *
 * fixed to the bottom of the viewport. the top edge is a drag
 * handle for resizing. when dragged below a threshold it snaps
 * to a collapsed min-height (just the handle bar). no separate
 * collapse/expand button.
 *
 * each entry is a row that can be clicked/tapped to expand its
 * children. status indicators:
 *   - running  → animated "…" (three dots cycling)
 *   - done     → ✓ checkmark (text-ok colour)
 *   - error    → ✗ cross (text-error colour)
 *   - pending  → dim dash
 *
 * progress is shown as a percentage next to the label when > 0.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useLogStore, LOG_MIN_HEIGHT, LOG_PANEL_HEADER_HEIGHT } from '../../stores/logStore'
import { useEditorStore } from '../../stores/editorStore'
import type { LogEntry, LogLine } from '../../stores/logStore'
import { snap } from '../../lib/snap'
import { isErrorOutputLine } from '../../core/output/normalize'
import { PropertiesPanel } from '../editor/PropertiesPanel'
import * as Icons from './Icons'
/** how far above log_min_height the panel still snaps closed (~one text row). */
const SNAP_ZONE = 48
const DEFAULT_PANEL_HEIGHT = 240

/* ── global synced dot animation ──────────────────────────── */

const FRAME_COUNT = 4
let _frame = 0
let _subs = new Set<() => void>()
let _timer: ReturnType<typeof setInterval> | null = null

function dotSubscribe(cb: () => void) {
  _subs.add(cb)
  if (!_timer) {
    _timer = setInterval(() => {
      _frame = (_frame + 1) % FRAME_COUNT
      _subs.forEach((fn) => fn())
    }, 400)
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

function Dots() {
  const f = useSyncExternalStore(dotSubscribe, dotSnapshot)
  return (
    <span className="inline-flex min-w-[3ch] text-accent">
      <span style={{ opacity: f === 0 || f === 1 || f === 2 ? 1 : 0 }}>.</span>
      <span style={{ opacity: f === 1 || f === 2 ? 1 : 0 }}>.</span>
      <span style={{ opacity: f === 2 ? 1 : 0 }}>.</span>
    </span>
  )
}

/* ── status prefix for a single entry ─────────────────────── */

function StatusPrefix({ status }: { status: LogEntry['status'] }) {
  switch (status) {
    case 'running':
      return <Dots />
    case 'done':
      return <Icons.Check width={12} height={12} strokeWidth={2} className="text-ok" />
    case 'error':
      return <span className="text-error">x</span>
    case 'pending':
    default:
      return <span className="text-text-muted">–</span>
  }
}

function getOutputLinePrefix(line: LogLine, entryId: string): { prefix: string; prefixClass: string; lineClass: string; ariaLabel: string } {
  // ffmpeg -i probe prints metadata to stderr even on success; show it as informational output.
  if (entryId.startsWith('ingest-probe::output') && !isErrorOutputLine(line.message)) {
    return { prefix: '·', prefixClass: 'text-text-muted', lineClass: 'text-text-muted/90', ariaLabel: 'probe output' }
  }

  if (isErrorOutputLine(line.message)) {
    return { prefix: '✗', prefixClass: 'text-error', lineClass: 'text-text-muted/90', ariaLabel: 'error output' }
  }

  switch (line.type) {
    case 'stderr':
      return { prefix: '·', prefixClass: 'text-text-muted', lineClass: 'text-text-muted/90', ariaLabel: 'stderr output' }
    case 'stdout':
      return { prefix: '>', prefixClass: 'text-text-muted', lineClass: 'text-text-muted/90', ariaLabel: 'stdout output' }
    case 'info':
    default:
      return { prefix: '·', prefixClass: 'text-text-muted', lineClass: 'text-text-muted/90', ariaLabel: 'info output' }
  }
}

type ActiveLogSummary = {
  labels: string[]
  progress: number
}

function statusGlyph(status: LogEntry['status']) {
  if (status === 'done') return '✓'
  if (status === 'error') return 'x'
  if (status === 'running') return '…'
  return '–'
}

function serializeLogEntry(entry: LogEntry, depth: number): string[] {
  const indent = '  '.repeat(depth)
  const lines: string[] = []
  const progressText = entry.status === 'running' && entry.progress > 0 ? ` ${Math.round(entry.progress)}%` : ''
  lines.push(`${indent}${statusGlyph(entry.status)} ${entry.label}${progressText}`)

  if (entry.detail) {
    lines.push(`${indent}  failure reason: ${entry.detail}`)
  }

  const hasChildren = entry.children.length > 0
  const hasOutput = (entry.outputLines?.length ?? 0) > 0

  if (hasChildren) {
    if (hasOutput) {
      lines.push(`${indent}  – console output`)
      for (const line of entry.outputLines ?? []) {
        const prefix = getOutputLinePrefix(line, `${entry.id}::output`).prefix
        lines.push(`${indent}    ${prefix} ${line.message}`)
      }
    }
    for (const child of entry.children) {
      lines.push(...serializeLogEntry(child, depth + 1))
    }
  } else if (hasOutput) {
    for (const line of entry.outputLines ?? []) {
      const prefix = getOutputLinePrefix(line, entry.id).prefix
      lines.push(`${indent}  ${prefix} ${line.message}`)
    }
  }

  return lines
}

function serializeLogTree(entries: LogEntry[]): string {
  return entries.flatMap((entry) => serializeLogEntry(entry, 0)).join('\n')
}

function findActiveLogSummary(entries: LogEntry[]): ActiveLogSummary | null {
  for (let idx = entries.length - 1; idx >= 0; idx -= 1) {
    const summary = findActiveEntryPath(entries[idx])
    if (summary) return summary
  }
  return null
}

function findActiveEntryPath(entry: LogEntry): ActiveLogSummary | null {
  for (let idx = entry.children.length - 1; idx >= 0; idx -= 1) {
    const childSummary = findActiveEntryPath(entry.children[idx])
    if (childSummary) {
      return {
        labels: [entry.label, ...childSummary.labels],
        progress: childSummary.progress,
      }
    }
  }

  if (entry.status === 'running') {
    return {
      labels: [entry.label],
      progress: entry.progress,
    }
  }

  return null
}

export function normalizeCopiedLogText(raw: string): string {
  const lines = raw.split(/\r?\n/)
  const out: string[] = []
  const markerTokens = new Set(['✓', '✗', 'x', '–', '>', '·', '!', '.', '...'])
  let pendingMarkers = ''

  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i].trim()
    const markerOnly = current.trim()

    if (markerTokens.has(markerOnly)) {
      pendingMarkers += markerOnly
      continue
    }

    if (current.length > 0) {
      if (pendingMarkers.length > 0) {
        out.push(`${pendingMarkers} ${current}`)
        pendingMarkers = ''
      } else {
        out.push(current)
      }
      continue
    }
  }

  if (pendingMarkers.length > 0) out.push(pendingMarkers)

  return out.join('\n')
}

function collectSubtreeHighlightIds(entry: LogEntry, into: Set<string>) {
  into.add(entry.id)

  const hasSyntheticOutputChild = entry.children.length > 0 && (entry.outputLines?.length ?? 0) > 0
  if (hasSyntheticOutputChild) {
    into.add(`${entry.id}::output`)
  }

  for (const child of entry.children) {
    collectSubtreeHighlightIds(child, into)
  }
}

function findHighlightedIds(entries: LogEntry[], hoveredId: string | null): Set<string> {
  if (!hoveredId) return new Set()

  for (const entry of entries) {
    const directMatch = findHighlightedIdsInEntry(entry, hoveredId)
    if (directMatch) return directMatch
  }

  return new Set()
}

function findHighlightedIdsInEntry(entry: LogEntry, hoveredId: string): Set<string> | null {
  if (entry.id === hoveredId) {
    const ids = new Set<string>()
    collectSubtreeHighlightIds(entry, ids)
    return ids
  }

  const syntheticOutputId = `${entry.id}::output`
  if (entry.children.length > 0 && (entry.outputLines?.length ?? 0) > 0 && syntheticOutputId === hoveredId) {
    return new Set([syntheticOutputId])
  }

  for (const child of entry.children) {
    const childMatch = findHighlightedIdsInEntry(child, hoveredId)
    if (childMatch) return childMatch
  }

  return null
}

/* ── single tree node (recursive) ──────────────────────────── */

function LogNode({
  entry,
  depth,
  highlightedIds,
  setHoveredId,
}: {
  entry: LogEntry
  depth: number
  highlightedIds: Set<string>
  setHoveredId: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const collapsedIds = useLogStore((s) => s.collapsedIds)
  const toggleCollapsed = useLogStore((s) => s.toggleCollapsed)
  const expanded = !collapsedIds.has(entry.id)
  const isSyntheticOutputNode = entry.id.endsWith('::output')
  const hasChildren = entry.children.length > 0
  const hasOutput = (entry.outputLines?.length ?? 0) > 0
  const expandable = hasChildren || hasOutput
  const outputVisible = hasOutput && expanded && !hasChildren
  const outputAsChild = hasChildren && hasOutput
  const isHighlighted = highlightedIds.has(entry.id)

  const outputNode: LogEntry | null = outputAsChild
    ? {
        id: `${entry.id}::output`,
        label: 'console output',
        status: 'pending',
        progress: 0,
        children: [],
        outputLines: entry.outputLines,
      }
    : null

  const onRowClick = useCallback(() => {
    const sel = window.getSelection()
    if (sel && sel.toString().length > 0) return
    if (expandable) toggleCollapsed(entry.id)
  }, [expandable, toggleCollapsed, entry.id])

  return (
    <div className={isSyntheticOutputNode ? 'group' : ''}>
      <div
        onClick={onRowClick}
        onMouseEnter={() => setHoveredId(entry.id)}
        onMouseLeave={() => setHoveredId((current) => (current === entry.id ? null : current))}
        className={`flex items-center gap-2 py-0.5 rounded transition-colors ${isSyntheticOutputNode ? 'text-text-muted/90' : ''} ${isHighlighted ? 'bg-bg-sunken/80' : isSyntheticOutputNode ? 'hover:bg-bg-sunken/60' : 'hover:bg-bg-sunken/70'}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        aria-label={`${entry.status} ${entry.label}${entry.status === 'running' && entry.progress > 0 ? ` ${Math.round(entry.progress)} percent` : ''}`}
      >
        {expandable ? (
          <span
            className="text-text-muted transition-transform duration-150 inline-block w-3 text-center select-none shrink-0"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            aria-expanded={expanded}
          >
            ›
          </span>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        <span className="min-w-0 flex items-center gap-2">
          <span className="shrink-0" aria-hidden="true">
            <StatusPrefix status={entry.status} />
          </span>
          <span className={isSyntheticOutputNode ? 'italic' : ''}>{entry.label}</span>
        </span>

        {entry.status === 'running' && entry.progress > 0 && (
          <span className="text-text-muted shrink-0">
            {Math.round(entry.progress)}%
          </span>
        )}
      </div>

      {entry.detail && expanded && (
        <div
        className={`flex items-center gap-2 py-0.5 rounded transition-colors ${expandable ? 'cursor-pointer' : 'cursor-default'} ${isSyntheticOutputNode ? 'text-text-muted/90' : ''}`}
        style={{
          paddingLeft: `${depth * 16 + 8}px`,
          backgroundColor: isHighlighted ? 'color-mix(in srgb, var(--wasmux-bg-sunken) 50%, transparent)' : undefined,
        }}
        >
          <div className="border-l-2 border-border pl-2 text-[12px] text-text">
            <span className="font-medium">failure reason:</span> {entry.detail}
          </div>
        </div>
      )}

      {expanded && outputNode && (
        <LogNode key={outputNode.id} entry={outputNode} depth={depth + 1} highlightedIds={highlightedIds} setHoveredId={setHoveredId} />
      )}

      {expanded &&
        entry.children.map((child) => (
          <LogNode key={child.id} entry={child} depth={depth + 1} highlightedIds={highlightedIds} setHoveredId={setHoveredId} />
        ))}

      {outputVisible && (
        <div
          onMouseEnter={() => setHoveredId(entry.id)}
          onMouseLeave={() => setHoveredId((current) => (current === entry.id ? null : current))}
          className={`m-0 py-1 text-[12px] leading-snug rounded text-text-muted/90 transition-colors ${isHighlighted ? 'bg-bg-sunken/60' : ''}`}
          style={{ paddingLeft: `${(depth + 1) * 16 + 10}px` }}
        >
          {entry.outputLines!.map((line, idx) => {
            const prefix = getOutputLinePrefix(line, entry.id)

            return (
              <div
                key={`${entry.id}-line-${idx}`}
                className={`whitespace-pre-wrap break-all ${prefix.lineClass}`}
                aria-label={`${prefix.ariaLabel}: ${line.message}`}
              >
                <span className={prefix.prefixClass}>{prefix.prefix}</span> <span>{line.message}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── main panel component ──────────────────────────────────── */

export function LogPanel() {
  const entries = useLogStore((s) => s.entries)
  const panelHeight = useLogStore((s) => s.panelHeight)
  const setPanelHeight = useLogStore((s) => s.setPanelHeight)
  const activeTab = useEditorStore((s) => s.activeTab)
  const setActiveTab = useEditorStore((s) => s.setActiveTab)
  const initializeConsoleView = useLogStore((s) => s.initializeConsoleView)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [copiedFeedback, setCopiedFeedback] = useState(false)
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight)
  const hasInitializedConsoleView = useRef(false)
  const dragging = useRef(false)
  const activePointerId = useRef<number | null>(null)
  const copyFeedbackTimer = useRef<number | null>(null)
  const startY = useRef(0)
  const startH = useRef(0)
  const tabRefs = useRef<Record<'video' | 'audio' | 'console', HTMLButtonElement | null>>({
    video: null,
    audio: null,
    console: null,
  })

  const isClosed = panelHeight === LOG_MIN_HEIGHT
  const isOpen = panelHeight > LOG_MIN_HEIGHT
  const visualActiveTab = isOpen ? activeTab : null
  const activeSummary = useMemo(() => (isClosed ? findActiveLogSummary(entries) : null), [entries, isClosed])
  const highlightedIds = useMemo(() => findHighlightedIds(entries, hoveredId), [entries, hoveredId])
  const activeSummaryText = activeSummary
    ? `${activeSummary.labels.join(' > ')}${activeSummary.progress > 0 ? ` ${Math.round(activeSummary.progress)}%` : ''}`
    : ''
  const logTabText = isClosed && activeSummary ? activeSummaryText : 'log'
  const panelMaxHeight = Math.max(LOG_MIN_HEIGHT + 1, Math.floor(viewportHeight * 0.6))
  const selectedTabStyle = {
    color: 'var(--wasmux-accent)',
    fontWeight: 700,
  } as const

  const clampPanelHeight = useCallback((height: number) => {
    return Math.min(panelMaxHeight, Math.max(LOG_MIN_HEIGHT, height))
  }, [panelMaxHeight])

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const clamped = clampPanelHeight(panelHeight)
    if (clamped !== panelHeight) {
      setPanelHeight(clamped)
    }
  }, [clampPanelHeight, panelHeight, setPanelHeight])

  const openPanel = useCallback(() => {
    setPanelHeight(clampPanelHeight(Math.max(DEFAULT_PANEL_HEIGHT, LOG_MIN_HEIGHT + 1)))
  }, [clampPanelHeight, setPanelHeight])

  const onTabClick = useCallback((tab: 'video' | 'audio' | 'console') => {
    if (tab === 'console' && !hasInitializedConsoleView.current) {
      initializeConsoleView()
      hasInitializedConsoleView.current = true
    }

    if (activeTab === tab && isOpen) {
      setPanelHeight(LOG_MIN_HEIGHT)
      return
    }
    setActiveTab(tab)
    if (isClosed) openPanel()
  }, [activeTab, initializeConsoleView, isClosed, isOpen, openPanel, setActiveTab, setPanelHeight])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    activePointerId.current = e.pointerId
    dragging.current = true
    startY.current = e.clientY
    startH.current = panelHeight
  }, [panelHeight])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
    if (!dragging.current) return
    const dy = startY.current - e.clientY
    const raw = startH.current + dy
    if (startH.current === LOG_MIN_HEIGHT && raw > LOG_MIN_HEIGHT && activeTab !== 'console') {
      setActiveTab('console')
    }
    const snapped = snap(raw, LOG_MIN_HEIGHT, SNAP_ZONE)
    setPanelHeight(clampPanelHeight(snapped))
  }, [activeTab, clampPanelHeight, setActiveTab, setPanelHeight])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    dragging.current = false
  }, [])

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    dragging.current = false
  }, [])

  const applyResize = useCallback((clientY: number) => {
    if (!dragging.current) return
    const dy = startY.current - clientY
    const raw = startH.current + dy
    if (startH.current === LOG_MIN_HEIGHT && raw > LOG_MIN_HEIGHT && activeTab !== 'console') {
      setActiveTab('console')
    }
    const snapped = snap(raw, LOG_MIN_HEIGHT, SNAP_ZONE)
    setPanelHeight(clampPanelHeight(snapped))
  }, [activeTab, clampPanelHeight, setActiveTab, setPanelHeight])

  useEffect(() => {
    const onWindowPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return
      if (e.pointerType === 'touch') return
      if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
      applyResize(e.clientY)
    }

    const onWindowPointerEnd = (e: PointerEvent) => {
      if (!dragging.current) return
      if (e.pointerType === 'touch') return
      if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
      activePointerId.current = null
      dragging.current = false
    }

    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerEnd)
    window.addEventListener('pointercancel', onWindowPointerEnd)

    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', onWindowPointerEnd)
      window.removeEventListener('pointercancel', onWindowPointerEnd)
    }
  }, [applyResize])

  const onResizeKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const STEP = 24

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setPanelHeight(clampPanelHeight(panelHeight + STEP))
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setPanelHeight(clampPanelHeight(panelHeight - STEP))
      return
    }

    if (e.key === 'Home') {
      e.preventDefault()
      setPanelHeight(LOG_MIN_HEIGHT)
      return
    }

    if (e.key === 'End') {
      e.preventDefault()
      setPanelHeight(clampPanelHeight(panelMaxHeight))
    }
  }, [clampPanelHeight, panelHeight, panelMaxHeight, setPanelHeight])

  const onTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, currentTab: 'video' | 'audio' | 'console') => {
    const order: Array<'video' | 'audio' | 'console'> = ['video', 'audio', 'console']
    const index = order.indexOf(currentTab)
    let nextIndex = index

    if (e.key === 'ArrowRight') nextIndex = (index + 1) % order.length
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + order.length) % order.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = order.length - 1
    else return

    e.preventDefault()
    e.stopPropagation()
    const nextTab = order[nextIndex]
    onTabClick(nextTab)
    tabRefs.current[nextTab]?.focus()
  }, [onTabClick])

  const flashCopiedFeedback = useCallback(() => {
    setCopiedFeedback(true)
    if (copyFeedbackTimer.current !== null) {
      window.clearTimeout(copyFeedbackTimer.current)
    }
    copyFeedbackTimer.current = window.setTimeout(() => {
      setCopiedFeedback(false)
      copyFeedbackTimer.current = null
    }, 1200)
  }, [])

  const onCopyTree = useCallback(async () => {
    const text = serializeLogTree(entries)
    if (!text.trim()) return

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      flashCopiedFeedback()
      return
    }

    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)

    flashCopiedFeedback()
  }, [entries, flashCopiedFeedback])

  useEffect(() => () => {
    if (copyFeedbackTimer.current !== null) {
      window.clearTimeout(copyFeedbackTimer.current)
    }
  }, [])

  const onLogCopy = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const selected = window.getSelection()?.toString() ?? ''
    if (!selected.trim()) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', normalizeCopiedLogText(selected))
  }, [])

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-bg-raised/95"
      style={{ height: `${panelHeight}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* drag handle */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onResizeKeyDown}
        className="flex items-center gap-2 px-2 cursor-ns-resize shrink-0"
        style={{ height: `${LOG_PANEL_HEADER_HEIGHT}px` }}
        role="separator"
        tabIndex={0}
        aria-label="Resize bottom panel"
        aria-orientation="horizontal"
        aria-valuemin={LOG_MIN_HEIGHT}
        aria-valuemax={Math.round(panelMaxHeight)}
        aria-valuenow={Math.round(panelHeight)}
      >
        <span className="inline-flex h-full min-w-[2.5ch] items-center justify-center select-none" aria-hidden="true">
          <svg width="14" height="2" viewBox="0 0 14 2" className="text-text-muted/70" fill="currentColor" focusable="false" aria-hidden="true">
            <circle cx="2" cy="1" r="0.8" />
            <circle cx="7" cy="1" r="0.8" />
            <circle cx="12" cy="1" r="0.8" />
          </svg>
        </span>
        <div className="flex items-center gap-1 text-[12px]" onClick={(e) => e.stopPropagation()} role="tablist" aria-label="Bottom panel tabs">
          <button
            ref={(el) => { tabRefs.current.video = el }}
            role="tab"
            id="bottom-tab-video"
            aria-selected={visualActiveTab === 'video'}
            aria-controls="bottom-panel-content-video"
            tabIndex={visualActiveTab === 'video' ? 0 : -1}
            className={`${visualActiveTab === 'video' ? 'text-accent font-semibold' : 'text-text-muted'} select-text cursor-pointer bg-transparent border-0 p-0`}
            style={visualActiveTab === 'video' ? selectedTabStyle : undefined}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onTabClick('video')}
            onKeyDown={(e) => onTabKeyDown(e, 'video')}
          >
            video
          </button>
          <span className="text-text-muted select-text cursor-text" aria-hidden="true">/</span>
          <button
            ref={(el) => { tabRefs.current.audio = el }}
            role="tab"
            id="bottom-tab-audio"
            aria-selected={visualActiveTab === 'audio'}
            aria-controls="bottom-panel-content-audio"
            tabIndex={visualActiveTab === 'audio' ? 0 : -1}
            className={`${visualActiveTab === 'audio' ? 'text-accent font-semibold' : 'text-text-muted'} select-text cursor-pointer bg-transparent border-0 p-0`}
            style={visualActiveTab === 'audio' ? selectedTabStyle : undefined}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onTabClick('audio')}
            onKeyDown={(e) => onTabKeyDown(e, 'audio')}
          >
            audio
          </button>
          <span className="text-text-muted select-text cursor-text" aria-hidden="true">/</span>
          <button
            ref={(el) => { tabRefs.current.console = el }}
            role="tab"
            id="bottom-tab-console"
            aria-selected={visualActiveTab === 'console'}
            aria-controls="bottom-panel-content-console"
            tabIndex={visualActiveTab === 'console' ? 0 : -1}
            className={`${visualActiveTab === 'console' ? 'text-accent font-semibold' : 'text-text-muted'} min-w-0 truncate select-text cursor-pointer bg-transparent border-0 p-0`}
            style={visualActiveTab === 'console' ? selectedTabStyle : undefined}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onTabClick('console')}
            onKeyDown={(e) => onTabKeyDown(e, 'console')}
            title={logTabText}
          >
            {isClosed && activeSummary ? <span className="inline-flex items-center gap-2"><StatusPrefix status="running" /><span>{logTabText}</span></span> : logTabText}
          </button>
        </div>
        <div className="flex-1" />
        {visualActiveTab === 'console' && isOpen && (
          <button
            className={`btn shrink-0 self-start mt-1 border-transparent ${copiedFeedback ? 'text-accent bg-bg-sunken border-border' : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              void onCopyTree()
            }}
            title={copiedFeedback ? 'Copied' : 'Copy log tree'}
            aria-label={copiedFeedback ? 'Copied log tree' : 'Copy log tree'}
          >
            {copiedFeedback ? <Icons.Check width={15} height={15} /> : <Icons.Copy width={15} height={15} />}
          </button>
        )}
      </div>

      {isOpen && activeTab === 'console' && (
        <div
          id="bottom-panel-content-console"
          role="tabpanel"
          aria-labelledby="bottom-tab-console"
          className="overflow-y-auto pb-2"
          style={{ height: `${panelHeight - LOG_PANEL_HEADER_HEIGHT}px` }}
          data-panel-tab="console"
          aria-live="polite"
          aria-label="Operation log"
          onCopy={onLogCopy}
        >
          <div
            role="log"
            aria-live="polite"
            aria-label="Operation log"
          >
          {entries.length === 0 ? (
            <div className="px-3 py-2 text-text-muted">nothing here yet</div>
          ) : (
            entries.map((entry) => (
              <LogNode key={entry.id} entry={entry} depth={0} highlightedIds={highlightedIds} setHoveredId={setHoveredId} />
            ))
          )}
          </div>
        </div>
      )}

      {isOpen && activeTab === 'video' && (
        <div
          id="bottom-panel-content-video"
          role="tabpanel"
          aria-labelledby="bottom-tab-video"
          style={{ height: `${panelHeight - LOG_PANEL_HEADER_HEIGHT}px` }}
        >
          <PropertiesPanel />
        </div>
      )}

      {isOpen && activeTab === 'audio' && (
        <div
          id="bottom-panel-content-audio"
          role="tabpanel"
          aria-labelledby="bottom-tab-audio"
          style={{ height: `${panelHeight - LOG_PANEL_HEADER_HEIGHT}px` }}
        >
          <PropertiesPanel />
        </div>
      )}
    </div>
  )
}
