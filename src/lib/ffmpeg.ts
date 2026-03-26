/** ffmpeg wasm singleton loader. */

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

/** loaded ffmpeg instance, if available. */
let instance: FFmpeg | null = null

/** shared in-flight load promise. */
let loadPromise: Promise<FFmpeg> | null = null

/** cached core asset urls reused across resets. */
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
