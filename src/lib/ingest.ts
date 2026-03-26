/** file ingest pipeline from ui input to ready preview. */

import { fetchFile } from '@ffmpeg/util'
import { getFFmpeg, resetFFmpeg } from './ffmpeg'
import { probeFile } from './probe'
import { useEditorStore } from '../stores/editorStore'
import { useLogStore } from '../stores/logStore'
import type { NativeFileHandle } from '../types/editor'
import type { ProbeResult } from '../types/editor'
import type { IngestionStatus } from '../types/editor'

const INGEST_ID = 'ingest'
const WRITE_ID = 'ingest-write'
const PROBE_ID = 'ingest-probe'
const PREVIEW_ID = 'ingest-preview'
const PROBE_VIDEO_BITRATE_ID = 'ingest-probe-video-bitrate'
const PROBE_AUDIO_BITRATE_ID = 'ingest-probe-audio-bitrate'

function getMissingBitrateDetail(kind: 'video' | 'audio', containerBitrate: number): string {
  if (containerBitrate > 0) {
    return `FFmpeg did not report a per-stream ${kind} bitrate. The file only exposed container bitrate (${containerBitrate} kb/s), which is total bitrate for the whole file.`
  }

  return `FFmpeg did not report ${kind} stream bitrate. This is common with variable-bitrate media or formats that omit per-stream bitrate metadata.`
}

export function validateProbeForIngest(probe: ProbeResult): string | null {
  const hasVideo = probe.videoTracks.length > 0
  const hasAudio = probe.audioTracks.length > 0

  if (!hasVideo && !hasAudio) {
    return 'No usable video or audio streams were detected in the selected file.'
  }

  if (hasVideo && (probe.width <= 0 || probe.height <= 0)) {
    return 'Video stream metadata is invalid (missing dimensions).'
  }

  if (probe.duration <= 0) {
    return 'The selected file has no playable duration.'
  }

  return null
}

/** active ingest token for stale-run cancellation. */
let currentIngestId = 0

export function isIngestionActive(status: IngestionStatus): boolean {
  return status === 'writing' || status === 'probing' || status === 'preview'
}

export function cancelIngest(): void {
  currentIngestId += 1
  resetFFmpeg()
  useLogStore.getState().removeEntry(INGEST_ID)
  const store = useEditorStore.getState()
  if (isIngestionActive(store.ingestionStatus)) {
    store.setIngestionStatus('idle')
  }
}

/** run full ingest flow for one file. */
export async function ingestFile(file: File, objectUrl: string, sourceHandle?: NativeFileHandle | null): Promise<void> {
  const store = useEditorStore.getState()
  const log = useLogStore.getState()

  // if an older ingest is still running, stop it first.
  const myId = ++currentIngestId
  resetFFmpeg()
  log.removeEntry(INGEST_ID)

  store.setIngestionStatus('writing')

  // create a root log entry so child steps have a shared parent.
  log.addEntry({
    id: INGEST_ID,
    label: `ingesting ${file.name}`,
    status: 'running',
    progress: 0,
    children: [],
  })

  try {
    const ffmpeg = await getFFmpeg()
    const filename = file.name

    // step 1: write the source file into the wasm fs.
    log.addChild(INGEST_ID, {
      id: WRITE_ID,
      label: 'writing to wasm fs',
      status: 'running',
      progress: 0,
      children: [],
    })

    await ffmpeg.writeFile(filename, await fetchFile(file))
    if (myId !== currentIngestId) return
    log.updateEntry(WRITE_ID, { status: 'done', progress: 100 })

    // step 2: probe media metadata.
    store.setIngestionStatus('probing')
    log.addChild(INGEST_ID, {
      id: PROBE_ID,
      label: 'probing metadata',
      status: 'running',
      progress: 0,
      children: [],
    })
    log.addChild(PROBE_ID, {
      id: PROBE_VIDEO_BITRATE_ID,
      label: 'fetching video bitrate',
      status: 'running',
      progress: 0,
      children: [],
    })
    log.addChild(PROBE_ID, {
      id: PROBE_AUDIO_BITRATE_ID,
      label: 'fetching audio bitrate',
      status: 'running',
      progress: 0,
      children: [],
    })

    const probe = await probeFile(ffmpeg, filename, PROBE_ID)
    if (myId !== currentIngestId) return
    if (probe.videoTracks.length > 0) {
      if (probe.videoBitrate === 0) {
        log.updateEntry(PROBE_VIDEO_BITRATE_ID, {
          status: 'error',
          progress: 100,
          detail: getMissingBitrateDetail('video', probe.containerBitrate),
        })
      } else {
        log.updateEntry(PROBE_VIDEO_BITRATE_ID, {
          status: 'done',
          progress: 100,
          detail: undefined,
        })
      }
    } else {
      log.updateEntry(PROBE_VIDEO_BITRATE_ID, {
        status: 'done',
        progress: 100,
        detail: 'No video track found in source.',
      })
    }

    if (probe.audioTracks.length > 0) {
      if (probe.audioBitrate === 0) {
        log.updateEntry(PROBE_AUDIO_BITRATE_ID, {
          status: 'error',
          progress: 100,
          detail: getMissingBitrateDetail('audio', probe.containerBitrate),
        })
      } else {
        log.updateEntry(PROBE_AUDIO_BITRATE_ID, {
          status: 'done',
          progress: 100,
          detail: undefined,
        })
      }
    } else {
      log.updateEntry(PROBE_AUDIO_BITRATE_ID, {
        status: 'done',
        progress: 100,
        detail: 'No audio track found in source.',
      })
    }
    log.updateEntry(PROBE_ID, { status: 'done', progress: 100 })

    const probeValidationError = validateProbeForIngest(probe)
    if (probeValidationError) {
      throw new Error(probeValidationError)
    }

    // load probe results into editor state before preview setup.
    store.loadFile(
      { name: file.name, size: file.size, type: file.type, objectUrl, sourceHandle: sourceHandle ?? null },
      probe,
    )

    // step 3: pick preview strategy.
    store.setIngestionStatus('preview')
    log.addChild(INGEST_ID, {
      id: PREVIEW_ID,
      label: 'preparing preview',
      status: 'running',
      progress: 0,
      children: [],
    })

    if (probe.videoTracks.length === 0) {
      store.setPreviewUrl(null)
      log.updateEntry(PREVIEW_ID, {
        status: 'done',
        progress: 100,
        label: 'preparing preview (audio-only)',
        detail: 'No video track found; preview is audio-only.',
      })
    } else {
      // try native playback first. if the browser rejects it, we fall back
      // to an mp4 preview transcode so the editor still works.
      const canPlayNative = await testNativePlayback(objectUrl)

      if (canPlayNative) {
        store.setPreviewUrl(objectUrl)
        log.updateEntry(PREVIEW_ID, {
          status: 'done',
          progress: 100,
          label: 'preparing preview (native)',
        })
      } else {
        // transcode to mp4 for browser preview
        const previewName = '_preview.mp4'
        try {
          await ffmpeg.exec([
            '-i', filename,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            previewName,
          ])

          const data = await ffmpeg.readFile(previewName)
          const blob = new Blob([data as BlobPart], { type: 'video/mp4' })
          const previewUrl = URL.createObjectURL(blob)
          store.setPreviewUrl(previewUrl)
          log.updateEntry(PREVIEW_ID, {
            status: 'done',
            progress: 100,
            label: 'preparing preview (transcoded)',
          })
        } catch (previewErr) {
          const previewMsg = previewErr instanceof Error ? previewErr.message : String(previewErr)
          throw new Error(`Preview transcode failed: ${previewMsg}`)
        } finally {
          await ffmpeg.deleteFile(previewName).catch(() => {})
        }
      }
    }

    if (myId !== currentIngestId) return

    // done
    store.setIngestionStatus('ready')
    log.updateEntry(INGEST_ID, {
      status: 'done',
      progress: 100,
    })
  } catch (err) {
    if (myId !== currentIngestId) return
    const msg = err instanceof Error ? err.message : String(err)
    store.setIngestionStatus('error')
    useLogStore.getState().updateEntry(INGEST_ID, {
      status: 'error',
      detail: msg,
      label: `ingest failed: ${file.name}`,
    })
  }
}

/** test whether a blob url is natively playable. */
async function canBrowserPlay(url: string): Promise<boolean> {
  return await new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'auto'

    let settled = false
    const settle = (result: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.oncanplay = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
      resolve(result)
    }

    const timer = setTimeout(() => settle(false), 3000)

    video.oncanplay = () => settle(true)
    video.onerror = () => settle(false)

    video.src = url
  })
}
