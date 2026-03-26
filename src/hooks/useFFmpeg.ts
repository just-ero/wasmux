/** ffmpeg wasm load hook. */

import { useEffect } from 'react'
import { getFFmpeg } from '@/lib/ffmpeg'
import { useLogStore } from '@/stores/logStore'
import { useFFmpegStore } from '@/stores/ffmpegStore'

const ENGINE_ID = 'ffmpeg-engine'
const DL_ID     = 'ffmpeg-download'
const INIT_ID   = 'ffmpeg-init'

let _started = false
let _loadingPromise: Promise<void> | null = null

export function startFFmpegLoad(): Promise<void> {
  if (_loadingPromise) return _loadingPromise

  _loadingPromise = (async () => {
    if (_started) return
    _started = true

    const log = useLogStore.getState()

    // hmr guard: old log entries can survive hot reload.
    if (log.entries.some((e) => e.id === ENGINE_ID)) return

    useFFmpegStore.getState().setStatus('loading')
    let initProgress = 0
    let initTicker: ReturnType<typeof setInterval> | null = null

    const stopInitTicker = () => {
      if (!initTicker) return
      clearInterval(initTicker)
      initTicker = null
    }

    const startInitTicker = () => {
      stopInitTicker()
      initProgress = 8
      initTicker = setInterval(() => {
        initProgress = Math.min(96, initProgress + 2)
        const s = useLogStore.getState()
        s.updateEntry(INIT_ID, { progress: initProgress })
        s.updateEntry(ENGINE_ID, { progress: Math.max(20, initProgress) })
      }, 250)
    }

    log.addEntry({
      id: ENGINE_ID,
      label: 'ffmpeg engine loading',
      status: 'running',
      progress: 0,
      children: [],
    })

    await getFFmpeg({
      onDownloading() {
        useLogStore.getState().addChild(ENGINE_ID, {
          id: DL_ID,
          label: 'downloading core',
          status: 'running',
          progress: 0,
          children: [],
        })
        useLogStore.getState().updateEntry(ENGINE_ID, { progress: 12 })
      },
      onInitializing() {
        useLogStore.getState().updateEntry(DL_ID, { status: 'done', progress: 100 })
        useLogStore.getState().addChild(ENGINE_ID, {
          id: INIT_ID,
          label: 'initializing wasm',
          status: 'running',
          progress: 0,
          children: [],
        })
        useLogStore.getState().updateEntry(ENGINE_ID, { progress: 20 })
        startInitTicker()
      },
    })
      .then(() => {
        stopInitTicker()
        const s = useLogStore.getState()
        s.updateEntry(INIT_ID, { status: 'done', progress: 100 })
        s.updateEntry(ENGINE_ID, {
          status: 'done',
          progress: 100,
        })
        useFFmpegStore.getState().setStatus('ready')
      })
      .catch((err) => {
        stopInitTicker()
        const msg = err instanceof Error ? err.message : String(err)
        const s = useLogStore.getState()
        s.updateEntry(INIT_ID, {
          status: 'error',
          detail: msg,
        })
        s.updateEntry(ENGINE_ID, {
          status: 'error',
          detail: msg,
          label: 'ffmpeg engine failed',
        })
        useFFmpegStore.getState().setStatus('error')
        _started = false
      })
  })()

  return _loadingPromise
}

export function useFFmpeg() {
  useEffect(() => {
    void startFFmpegLoad()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
