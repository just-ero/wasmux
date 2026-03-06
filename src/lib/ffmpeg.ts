/**
 * ffmpeg.ts - ffmpeg wasm singleton.
 *
 * this module lazily loads the ffmpeg wasm binary the first time
 * getffmpeg() is called. subsequent calls return the same promise
 * (and eventually the same resolved ffmpeg instance).
 *
 * multi-thread vs single-thread:
 *   - if `sharedarraybuffer` is available (requires coop/coep
 *     headers - see vite.config.ts), we load the multi-threaded
 *     core (@ffmpeg/core-mt) which uses web workers for parallel
 *     encoding and is ~2× faster.
 *   - otherwise we fall back to the single-threaded core. the ui
 *     should warn the user about degraded performance.
 *
 * core assets are loaded from bundled same-origin package files.
 * their resolved urls are passed directly to ffmpeg.load().
 *
 * if loading fails (e.g. network error), the promise and instance
 * are reset so the next call to getffmpeg() will retry.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import coreJsUrl from '@ffmpeg/core?url'
import coreWasmUrl from '@ffmpeg/core/wasm?url'
import coreMtJsUrl from '@ffmpeg/core-mt?url'
import coreMtWasmUrl from '@ffmpeg/core-mt/wasm?url'

function isStandaloneAppMode(): boolean {
  if (typeof window === 'undefined') return false

  const inStandaloneDisplayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches

  const iosStandalone =
    typeof navigator !== 'undefined' &&
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)

  const twaReferrer =
    typeof document !== 'undefined' &&
    typeof document.referrer === 'string' &&
    document.referrer.startsWith('android-app://')

  return inStandaloneDisplayMode || iosStandalone || twaReferrer
}

function shouldUseMultiThreadCore(): boolean {
  // @ffmpeg/core-mt worker bootstrapping is currently unstable in vite dev.
  // keep dev on single-thread for reliability; production can still use mt.
  if (import.meta.env.DEV) return false

  if (typeof SharedArrayBuffer === 'undefined') return false

  // in installed app windows some chromium builds can become unstable with
  // the mt core + workers. prefer single-thread there for startup stability.
  if (isStandaloneAppMode()) return false

  return true
}

/** the single ffmpeg instance (null until loaded). */
let instance: FFmpeg | null = null

/** shared promise so concurrent callers don't trigger multiple loads. */
let loadPromise: Promise<FFmpeg> | null = null

/** cached resolved core asset urls reused across resets. */
let cachedURLs: { coreURL: string; wasmURL: string; workerURL?: string } | null = null

function stripQuery(url: string): string {
  return url.replace(/\?.*$/, '')
}

function buildSingleThreadURLs(): { coreURL: string; wasmURL: string } {
  return {
    coreURL: stripQuery(coreJsUrl),
    wasmURL: stripQuery(coreWasmUrl),
  }
}

function buildMultiThreadURLs(): { coreURL: string; wasmURL: string; workerURL: string } {
  const coreURL = stripQuery(coreMtJsUrl)
  return {
    coreURL,
    wasmURL: stripQuery(coreMtWasmUrl),
    workerURL: coreURL.replace('ffmpeg-core.js', 'ffmpeg-core.worker.js'),
  }
}

/** callbacks for logging phase progress during load. */
export interface LoadCallbacks {
  onDownloading?: () => void
  onInitializing?: () => void
}

/**
 * get (or create) the singleton ffmpeg instance.
 * returns a promise that resolves once the wasm binary is loaded
 * and ffmpeg is ready to accept exec() calls.
 */
export function getFFmpeg(cbs?: LoadCallbacks): Promise<FFmpeg> {
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    let ffmpeg = new FFmpeg()
    instance = ffmpeg

    if (cachedURLs) {
      await ffmpeg.load(cachedURLs)
      return ffmpeg
    }

    const singleThreadURLs = buildSingleThreadURLs()
    const multiThreadURLs = buildMultiThreadURLs()
    const prefersMultiThread = shouldUseMultiThreadCore()

    cbs?.onDownloading?.()
    cbs?.onInitializing?.()

    const preferred = prefersMultiThread ? multiThreadURLs : singleThreadURLs

    try {
      await ffmpeg.load(preferred)
      cachedURLs = preferred
      return ffmpeg
    } catch (err) {
      // if mt worker bootstrap fails, automatically retry single-threaded core.
      if (prefersMultiThread) {
        try {
          ffmpeg.terminate()
        } catch {
          // no-op
        }

        ffmpeg = new FFmpeg()
        instance = ffmpeg
        await ffmpeg.load(singleThreadURLs)
        cachedURLs = singleThreadURLs
        return ffmpeg
      }

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

/**
 * terminate the current ffmpeg instance (kills any in-flight
 * exec/writefile) and clear the singleton so the next getffmpeg()
 * creates a fresh one. cached resolved urls are preserved.
 */
export function resetFFmpeg(): void {
  if (instance) {
    try { instance.terminate() } catch { /* already terminated */ }
    instance = null
  }
  loadPromise = null
}

/** get the already-loaded ffmpeg instance, or null if still loading. */
export function getLoadedFFmpeg(): FFmpeg | null {
  return instance
}
