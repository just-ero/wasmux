/** global browser memory telemetry sampler. */

import { create } from 'zustand'

export interface MemorySample {
  t: number
  usedMiB: number
  allocatedMiB: number
  limitMiB: number
}

export type MemorySource = 'performance.memory' | 'measureUserAgentSpecificMemory' | 'unavailable' | 'off'

interface PerformanceMemory {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory
  measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>
}

interface MemoryTelemetryState {
  samples: MemorySample[]
  samplingMs: number
  hasSamplingPreference: boolean
  source: MemorySource
  peakUsedMiB: number
  peakAllocatedMiB: number
  setSamplingMs: (value: number) => void
  unsetSamplingMs: () => void
}

const DEFAULT_SAMPLING_MS = 0
const MAX_HISTORY_MS = 10 * 60_000
const SAMPLING_COOKIE_KEY = 'wasmux_sampling_ms'
const SAMPLING_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

let started = false
let inFlight = false
let timer: number | null = null

function toMiB(bytes: number): number {
  return bytes / (1024 * 1024)
}

function clampSamplingMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SAMPLING_MS
  if (value <= 0) return 0
  return Math.max(20, Math.min(10_000, Math.round(value)))
}

function readSamplingMsFromCookie(): { value: number; hasCookie: boolean } {
  if (typeof document === 'undefined') return { value: 0, hasCookie: false }
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SAMPLING_COOKIE_KEY}=`))

  if (!cookie) return { value: 0, hasCookie: false }
  const raw = cookie.slice(`${SAMPLING_COOKIE_KEY}=`.length)
  const parsed = Number(decodeURIComponent(raw))
  if (!Number.isFinite(parsed)) return { value: 0, hasCookie: false }
  return { value: clampSamplingMs(parsed), hasCookie: true }
}

function writeSamplingMsCookie(value: number): void {
  if (typeof document === 'undefined') return
  document.cookie = `${SAMPLING_COOKIE_KEY}=${encodeURIComponent(String(value))}; Max-Age=${SAMPLING_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`
}

function clearSamplingMsCookie(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${SAMPLING_COOKIE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`
}

const INITIAL_SAMPLING_PREF = readSamplingMsFromCookie()

function getHeapMemory(): PerformanceMemory | null {
  const perf = performance as PerformanceWithMemory
  return perf.memory ?? null
}

async function getUserAgentMemory(): Promise<{ bytes: number } | null> {
  const perf = performance as PerformanceWithMemory
  if (typeof perf.measureUserAgentSpecificMemory !== 'function') return null
  try {
    return await perf.measureUserAgentSpecificMemory()
  } catch {
    return null
  }
}

export const useMemoryTelemetryStore = create<MemoryTelemetryState>((set) => ({
  samples: [],
  samplingMs: INITIAL_SAMPLING_PREF.value,
  hasSamplingPreference: INITIAL_SAMPLING_PREF.hasCookie,
  source: INITIAL_SAMPLING_PREF.value === 0 ? 'off' : 'unavailable',
  peakUsedMiB: 0,
  peakAllocatedMiB: 0,
  setSamplingMs: (value) => {
    const next = clampSamplingMs(value)
    writeSamplingMsCookie(next)
    set({
      samplingMs: next,
      hasSamplingPreference: true,
      source: next === 0 ? 'off' : useMemoryTelemetryStore.getState().source,
    })
    restartSamplingTimer()
  },
  unsetSamplingMs: () => {
    clearSamplingMsCookie()
    set({
      samplingMs: DEFAULT_SAMPLING_MS,
      hasSamplingPreference: false,
      source: 'off',
    })
    restartSamplingTimer()
  },
}))

function scheduleNextTick(delayMs: number): void {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
  timer = window.setTimeout(() => {
    void sampleOnce()
  }, delayMs)
}

function restartSamplingTimer(): void {
  if (!started) return
  const ms = useMemoryTelemetryStore.getState().samplingMs
  if (ms <= 0) {
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
    return
  }
  scheduleNextTick(ms)
}

async function sampleOnce(): Promise<void> {
  const state = useMemoryTelemetryStore.getState()
  if (state.samplingMs <= 0) return

  if (inFlight) {
    scheduleNextTick(state.samplingMs)
    return
  }

  inFlight = true
  const now = Date.now()

  const mem = getHeapMemory()
  if (mem) {
    const usedMiB = toMiB(mem.usedJSHeapSize)
    const allocatedMiB = toMiB(mem.totalJSHeapSize)
    const limitMiB = toMiB(mem.jsHeapSizeLimit)

    useMemoryTelemetryStore.setState((prev) => {
      const cutoff = now - MAX_HISTORY_MS
      const samples = [...prev.samples.filter((sample) => sample.t >= cutoff), {
        t: now,
        usedMiB,
        allocatedMiB,
        limitMiB,
      }]

      return {
        samples,
        source: 'performance.memory',
        peakUsedMiB: Math.max(prev.peakUsedMiB, usedMiB),
        peakAllocatedMiB: Math.max(prev.peakAllocatedMiB, allocatedMiB),
      }
    })

    inFlight = false
    scheduleNextTick(useMemoryTelemetryStore.getState().samplingMs)
    return
  }

  const uaMemory = await getUserAgentMemory()
  if (uaMemory) {
    const usedMiB = toMiB(uaMemory.bytes)
    useMemoryTelemetryStore.setState((prev) => {
      const cutoff = now - MAX_HISTORY_MS
      const samples = [...prev.samples.filter((sample) => sample.t >= cutoff), {
        t: now,
        usedMiB,
        allocatedMiB: usedMiB,
        limitMiB: usedMiB,
      }]

      return {
        samples,
        source: 'measureUserAgentSpecificMemory',
        peakUsedMiB: Math.max(prev.peakUsedMiB, usedMiB),
        peakAllocatedMiB: Math.max(prev.peakAllocatedMiB, usedMiB),
      }
    })
  } else {
    useMemoryTelemetryStore.setState({ source: 'unavailable' })
  }

  inFlight = false
  scheduleNextTick(useMemoryTelemetryStore.getState().samplingMs)
}

export function startMemoryTelemetry(): void {
  if (started || typeof window === 'undefined') return
  started = true
  const ms = useMemoryTelemetryStore.getState().samplingMs
  if (ms <= 0) {
    useMemoryTelemetryStore.setState({ source: 'off' })
    return
  }
  scheduleNextTick(0)
}
