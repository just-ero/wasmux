/** ffmpeg wasm singleton loader. */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import coreJsUrl from '@ffmpeg/core?url'
import coreWasmUrl from '@ffmpeg/core/wasm?url'

/** loaded ffmpeg instance, if available. */
let instance: FFmpeg | null = null

const FFmpeg_LOAD_TIMEOUT_MS = 25000

/** shared in-flight load promise. */
let loadPromise: Promise<FFmpeg> | null = null

function stripQuery(url: string): string {
  return url.replace(/\?.*$/, '')
}

function buildURLs(): { coreURL: string; wasmURL: string } {
  return {
    coreURL: stripQuery(coreJsUrl),
    wasmURL: stripQuery(coreWasmUrl),
  }
}

async function loadWithTimeout(
  ffmpeg: FFmpeg,
  urls: { coreURL: string; wasmURL: string },
  timeoutMs: number,
): Promise<void> {
  let timeoutId: number | null = null
  try {
    await Promise.race([
      ffmpeg.load(urls),
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error(`FFmpeg core load timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId)
  }
}

/** load lifecycle callbacks. */
export interface LoadCallbacks {
  onDownloading?: () => void
  onInitializing?: () => void
}

/** get or create the singleton ffmpeg instance. */
export function getFFmpeg(cbs?: LoadCallbacks): Promise<FFmpeg> {
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg()
    instance = ffmpeg
    cbs?.onDownloading?.()
    cbs?.onInitializing?.()
    await loadWithTimeout(ffmpeg, buildURLs(), FFmpeg_LOAD_TIMEOUT_MS)
    return ffmpeg
  })()

  loadPromise.catch(() => {
    loadPromise = null
    instance = null
  })

  return loadPromise
}

/** whether ffmpeg.exec is currently running (to know if we need to terminate on cancel). */
let execRunning = false

export function setExecRunning(v: boolean) { execRunning = v }

/** terminate and clear the current ffmpeg instance. */
export function resetFFmpeg() {
  if (instance) {
    try { instance.terminate() } catch { /* already terminated */ }
    instance = null
  }
  loadPromise = null
  execRunning = false
}

/**
 * Cancel any in-flight exec without tearing down the loaded wasm instance.
 * Only terminates if an exec is actually running.
 */
export function cancelExec() {
  if (execRunning) {
    resetFFmpeg()
  }
}

/** return loaded ffmpeg instance, or null. */
export function getLoadedFFmpeg(): FFmpeg | null {
  return instance
}
