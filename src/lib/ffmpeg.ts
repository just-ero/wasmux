/** ffmpeg wasm singleton loader. */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import coreJsUrl from '@ffmpeg/core?url'
import coreWasmUrl from '@ffmpeg/core/wasm?url'

/** loaded ffmpeg instance, if available. */
let instance: FFmpeg | null = null

const FFmpeg_LOAD_TIMEOUT_ST_MS = 25000

/** shared in-flight load promise. */
let loadPromise: Promise<FFmpeg> | null = null

/** cached core asset urls reused across resets. */
let cachedURLs: { coreURL: string; wasmURL: string } | null = null

function stripQuery(url: string): string {
  return url.replace(/\?.*$/, '')
}

function buildSingleThreadURLs(): { coreURL: string; wasmURL: string } {
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
    let ffmpeg = new FFmpeg()
    instance = ffmpeg
    const singleThreadURLs = buildSingleThreadURLs()
    const preferred = singleThreadURLs
    const preferredTimeout = FFmpeg_LOAD_TIMEOUT_ST_MS

    if (cachedURLs) {
      try {
        await loadWithTimeout(ffmpeg, cachedURLs, preferredTimeout)
        return ffmpeg
      } catch {
        try {
          ffmpeg.terminate()
        } catch {
          // no-op
        }

        ffmpeg = new FFmpeg()
        instance = ffmpeg
        await loadWithTimeout(ffmpeg, singleThreadURLs, FFmpeg_LOAD_TIMEOUT_ST_MS)
        cachedURLs = singleThreadURLs
        return ffmpeg
      }
    }

    cbs?.onDownloading?.()
    cbs?.onInitializing?.()

    try {
      await loadWithTimeout(ffmpeg, preferred, preferredTimeout)
      cachedURLs = preferred
      return ffmpeg
    } catch (err) {
      throw err
    }
  })()

  // on failure, clear both so the next call retries from scratch.
  loadPromise.catch(() => {
    loadPromise = null
    instance = null
  })

  return loadPromise
}

/** terminate and clear the current ffmpeg instance. */
export function resetFFmpeg() {
  if (instance) {
    try { instance.terminate() } catch { /* already terminated */ }
    instance = null
  }
  loadPromise = null
}

/** return loaded ffmpeg instance, or null. */
export function getLoadedFFmpeg(): FFmpeg | null {
  return instance
}
