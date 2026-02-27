/**
 * logstore.ts - zustand store for the log / job tree.
 *
 * this is separate from editorstore because log entries exist
 * across the entire app lifecycle (landing page included - the
 * very first entry is "loading ffmpeg engine…").
 *
 * the log is a flat list of logentry items. each entry can have
 * children (sub-steps). the tree structure is rendered by the
 * logpanel component.
 *
 * entry statuses control what icon / animation is shown:
 *   - pending   → dim, no icon
 *   - running   → animated "…" dots
 *   - done      → ✓ check
 *   - error     → ✗ cross
 *
 * progress is 0-100 and shown as a percentage when > 0.
 */

import { create } from 'zustand'

/* ── types ─────────────────────────────────────────────────── */

export type LogEntryStatus = 'pending' | 'running' | 'done' | 'error'
export type LogLineType = 'stderr' | 'stdout' | 'info'

export interface LogLine {
  type: LogLineType
  message: string
}

export interface LogEntry {
  id: string
  label: string
  status: LogEntryStatus
  /** 0-100. only displayed when > 0. */
  progress: number
  /** optional detail text (e.g. error messages). */
  detail?: string
  /** raw console output lines captured from command runners. */
  outputLines?: LogLine[]
  /** nested child entries (sub-steps of this job). */
  children: LogEntry[]
}

/** always-visible panel header / drag handle height in px. */
export const LOG_PANEL_HEADER_HEIGHT = 28

/** collapsed height in px (just the drag handle). */
export const LOG_MIN_HEIGHT = LOG_PANEL_HEADER_HEIGHT

interface LogState {
  entries: LogEntry[]
  /** panel height in px. log_min_height = collapsed. */
  panelHeight: number
  setPanelHeight: (h: number) => void

  /** add a root-level entry. */
  addEntry: (entry: LogEntry) => void

  /**
   * update a single entry by id (shallow merge).
   * searches recursively through the tree.
   */
  updateEntry: (id: string, patch: Partial<Omit<LogEntry, 'id' | 'children'>>) => void

  /**
   * add a child entry under a parent entry.
   * searches recursively by parentid.
   */
  addChild: (parentId: string, child: LogEntry) => void

  /**
   * append a raw output line to an entry's outputlines array.
   * searches recursively by id.
   */
  appendOutput: (id: string, line: string, type?: LogLineType) => void

  /** remove a root-level entry by id (including all children). */
  removeEntry: (id: string) => void

  /** set of entry ids that the user has manually collapsed. */
  collapsedIds: Set<string>
  toggleCollapsed: (id: string) => void
  initializeConsoleView: () => void
}

/* ── helpers ───────────────────────────────────────────────── */

/** recursively patch an entry by id. returns a new array (immutable). */
function patchEntry(
  entries: LogEntry[],
  id: string,
  patch: Partial<Omit<LogEntry, 'id' | 'children'>>,
): LogEntry[] {
  return entries.map((e) => {
    if (e.id === id) return { ...e, ...patch }
    if (e.children.length > 0) {
      return { ...e, children: patchEntry(e.children, id, patch) }
    }
    return e
  })
}

/** maximum output lines kept per log entry to prevent memory exhaustion. */
const MAX_OUTPUT_LINES = 5000

function appendOutputLines(
  entries: LogEntry[],
  id: string,
  linesToAppend: LogLine[],
): LogEntry[] {
  if (linesToAppend.length === 0) return entries

  return entries.map((e) => {
    if (e.id === id) {
      const lines = [...(e.outputLines ?? []), ...linesToAppend]
      return { ...e, outputLines: lines.length > MAX_OUTPUT_LINES ? lines.slice(-MAX_OUTPUT_LINES) : lines }
    }
    if (e.children.length > 0) {
      return { ...e, children: appendOutputLines(e.children, id, linesToAppend) }
    }
    return e
  })
}

/** recursively find an entry and append a child. returns a new array. */
function appendChild(
  entries: LogEntry[],
  parentId: string,
  child: LogEntry,
): LogEntry[] {
  return entries.map((e) => {
    if (e.id === parentId) {
      return { ...e, children: [...e.children, child] }
    }
    if (e.children.length > 0) {
      return { ...e, children: appendChild(e.children, parentId, child) }
    }
    return e
  })
}

function collectEntryIds(entry: LogEntry): string[] {
  return [entry.id, ...entry.children.flatMap(collectEntryIds)]
}

function collectDisplayIds(entry: LogEntry): string[] {
  const ids = [entry.id]
  if (entry.children.length > 0 && (entry.outputLines?.length ?? 0) > 0) {
    ids.push(`${entry.id}::output`)
  }
  for (const child of entry.children) {
    ids.push(...collectDisplayIds(child))
  }
  return ids
}

function collectRunningExpansionIds(entries: LogEntry[]): Set<string> {
  const expanded = new Set<string>()

  const visit = (entry: LogEntry, ancestors: string[]) => {
    const nextAncestors = [...ancestors, entry.id]

    if (entry.status === 'running') {
      for (const ancestorId of ancestors) expanded.add(ancestorId)
      for (const id of collectDisplayIds(entry)) expanded.add(id)
    }

    for (const child of entry.children) {
      visit(child, nextAncestors)
    }
  }

  for (const entry of entries) {
    visit(entry, [])
  }

  return expanded
}

function findEntry(entries: LogEntry[], id: string): LogEntry | null {
  for (const entry of entries) {
    if (entry.id === id) return entry
    const childMatch = findEntry(entry.children, id)
    if (childMatch) return childMatch
  }
  return null
}

/* ── store ─────────────────────────────────────────────────── */

export const useLogStore = create<LogState>((set) => {
  const pendingOutput = new Map<string, LogLine[]>()
  let flushScheduled = false

  const scheduleFlush = () => {
    if (flushScheduled) return
    flushScheduled = true

    const enqueueFlush =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16)

    enqueueFlush(() => {
      flushScheduled = false
      if (pendingOutput.size === 0) return

      set((s) => {
        const nextCollapsed = new Set(s.collapsedIds)
        let nextEntries = s.entries

        for (const [id, lines] of pendingOutput.entries()) {
          if (lines.length === 0) continue
          const target = findEntry(nextEntries, id)
          if (target && target.children.length > 0 && target.status !== 'running') {
            nextCollapsed.add(`${id}::output`)
          }
          nextEntries = appendOutputLines(nextEntries, id, lines)
        }

        pendingOutput.clear()
        return { entries: nextEntries, collapsedIds: nextCollapsed }
      })
    })
  }

  return ({
  entries: [],
  panelHeight: LOG_MIN_HEIGHT,
  setPanelHeight: (panelHeight) => set({ panelHeight }),

  addEntry: (entry) =>
    set((s) => {
      const nextCollapsed = new Set(s.collapsedIds)
      for (const id of collectEntryIds(entry)) nextCollapsed.add(id)
      if (entry.status === 'running') {
        nextCollapsed.delete(entry.id)
      }
      return { entries: [...s.entries, entry], collapsedIds: nextCollapsed }
    }),

  updateEntry: (id, patch) =>
    set((s) => ({ entries: patchEntry(s.entries, id, patch) })),

  addChild: (parentId, child) =>
    set((s) => {
      const nextCollapsed = new Set(s.collapsedIds)
      nextCollapsed.delete(parentId)
      for (const id of collectEntryIds(child)) nextCollapsed.add(id)
      if (child.status === 'running') {
        nextCollapsed.delete(child.id)
      }
      return { entries: appendChild(s.entries, parentId, child), collapsedIds: nextCollapsed }
    }),

  appendOutput: (id, line, type = 'info') =>
    (() => {
      const queued = pendingOutput.get(id)
      const nextLine = { type, message: line }
      if (queued) queued.push(nextLine)
      else pendingOutput.set(id, [nextLine])
      scheduleFlush()
    })(),

  removeEntry: (id) =>
    set((s) => {
      const nextEntries = s.entries.filter((e) => e.id !== id)
      const nextCollapsed = new Set(s.collapsedIds)
      const removed = findEntry(s.entries, id)
      if (removed) {
        for (const entryId of collectEntryIds(removed)) nextCollapsed.delete(entryId)
      }
      return { entries: nextEntries, collapsedIds: nextCollapsed }
    }),

  collapsedIds: new Set<string>(),
  toggleCollapsed: (id) =>
    set((s) => {
      const next = new Set(s.collapsedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { collapsedIds: next }
    }),

  initializeConsoleView: () =>
    set((s) => {
      const collapsed = new Set<string>()
      for (const entry of s.entries) {
        for (const id of collectDisplayIds(entry)) collapsed.add(id)
      }

      const expanded = collectRunningExpansionIds(s.entries)
      for (const id of expanded) collapsed.delete(id)

      return { collapsedIds: collapsed }
    }),
  })
})
