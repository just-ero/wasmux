/** file ingest pipeline from ui input to ready preview. */

import { fetchFile } from '@ffmpeg/util'
import { getFFmpeg, resetFFmpeg } from '@/lib/ffmpeg'
import { probeFile } from '@/lib/probe'
import { useEditorStore } from '@/stores/editorStore'
import { useLogStore } from '@/stores/logStore'
import type { NativeFileHandle } from '@/types/editor'
import type { ProbeResult } from '@/types/editor'
import type { IngestionStatus } from '@/types/editor'

const INGEST_ID = 'ingest'
const WRITE_ID = 'ingest-write'
const PROBE_ID = 'ingest-probe'
const PREVIEW_ID = 'ingest-preview'
const PROBE_VIDEO_BITRATE_ID = 'ingest-probe-video-bitrate'
const PROBE_AUDIO_BITRATE_ID = 'ingest-probe-audio-bitrate'

function formatGiB(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`
}

function getMissingBitrateDetail(kind: 'video' | 'audio', containerBitrate: number): string {
  if (containerBitrate > 0) {
    return `FFmpeg did not report a per-stream ${kind} bitrate. The file only exposed container bitrate (${containerBitrate} kb/s), which is total bitrate for the whole file.`
  }

  return `FFmpeg did not report ${kind} stream bitrate. This is common with variable-bitrate media or formats that omit per-stream bitrate metadata.`
}

function normalizeCodecName(codec: string): string {
  return codec.trim().toLowerCase()
}

function canLikelyPlayNativeAudioCodec(codec: string): boolean {
  const normalized = normalizeCodecName(codec)
  // Conservative allow-list for browser-decoded audio codecs.
  return normalized === 'aac'
    || normalized === 'mp3'
    || normalized === 'opus'
    || normalized === 'vorbis'
    || normalized === 'flac'
    || normalized === 'alac'
    || normalized.startsWith('pcm_')
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

  let ingestProgress = 5
  let stageTicker: ReturnType<typeof setInterval> | null = null

  const stopStageTicker = () => {
    if (!stageTicker) return
    clearInterval(stageTicker)
    stageTicker = null
  }

  const setIngestProgress = (next: number) => {
    ingestProgress = Math.max(ingestProgress, next)
    log.updateEntry(INGEST_ID, { progress: ingestProgress })
  }

  const startStageTicker = (targetMax: number, step = 1, intervalMs = 500) => {
    stopStageTicker()
    stageTicker = setInterval(() => {
      if (myId !== currentIngestId) {
        stopStageTicker()
        return
      }
      if (ingestProgress >= targetMax) return
      ingestProgress = Math.min(targetMax, ingestProgress + step)
      log.updateEntry(INGEST_ID, { progress: ingestProgress })
    }, intervalMs)
  }

  store.setIngestionStatus('writing')

  // create a root log entry so child steps have a shared parent.
  log.addEntry({
    id: INGEST_ID,
    label: `ingesting ${file.name}`,
    status: 'running',
    progress: ingestProgress,
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
    startStageTicker(28, 1, 400)

    try {
      await ffmpeg.writeFile(filename, await fetchFile(file))
    } catch (writeErr) {
      const writeMsg = writeErr instanceof Error ? writeErr.message : String(writeErr)
      if (/could not be read|not.?readable|code\s*=\s*-1/i.test(writeMsg)) {
        throw new Error(
          `Source file could not be read by the browser (code=-1). `
          + `If this is a very large file (${formatGiB(file.size)}), ffmpeg.wasm can fail before the hard cap because ingest keeps multiple in-memory copies. `
          + 'The Heap Memory graph is main-thread JS heap only and does not include ffmpeg worker wasm memory. '
          + 'Try selecting it again, use drag and drop, or copy it to a local folder and retry.',
        )
      }
      if (/memory access out of bounds|out of memory|wasm memory/i.test(writeMsg)) {
        throw new Error(
          `Not enough wasm memory to ingest ${formatGiB(file.size)}. `
          + 'In practice, very large files can fail below the nominal 2 GiB cap because ffmpeg.wasm duplicates buffers during write/probe. '
          + 'Try trimming first, using a smaller intermediate file, or exporting in chunks.',
        )
      }
      throw new Error(`Failed to load source media into wasm file system: ${writeMsg}`)
    }
    if (myId !== currentIngestId) return
    setIngestProgress(30)
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
    startStageTicker(63, 1, 350)

    const probe = await probeFile(ffmpeg, filename, PROBE_ID)
    if (myId !== currentIngestId) return
    setIngestProgress(65)
    if (probe.videoTracks.length > 0) {
      if (probe.videoBitrate === 0) {
        log.updateEntry(PROBE_VIDEO_BITRATE_ID, {
          status: 'done',
          progress: 100,
          label: 'fetching video bitrate (unavailable)',
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
          status: 'done',
          progress: 100,
          label: 'fetching audio bitrate (unavailable)',
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
    setIngestProgress(80)
    log.addChild(INGEST_ID, {
      id: PREVIEW_ID,
      label: 'preparing preview',
      status: 'running',
      progress: 0,
      children: [],
    })
    startStageTicker(94, 1, 450)

    if (probe.videoTracks.length === 0) {
      store.setPreviewUrl(null)
      setIngestProgress(95)
      log.updateEntry(PREVIEW_ID, {
        status: 'done',
        progress: 100,
        label: 'preparing preview (audio-only)',
        detail: 'No video track found; preview is audio-only.',
      })
    } else {
      // try native playback first. if the browser rejects it, we fall back
      // to an mp4 preview transcode so the editor still works.
      const canPlayNative = await canBrowserPlay(objectUrl)
      const hasAudioTrack = probe.audioTracks.length > 0
      const hasLikelyUnsupportedAudioCodec = hasAudioTrack && !canLikelyPlayNativeAudioCodec(probe.audioCodec)

      const shouldForceTranscodedPreviewForAudio = canPlayNative && hasLikelyUnsupportedAudioCodec

      if (canPlayNative && !shouldForceTranscodedPreviewForAudio) {
        store.setPreviewUrl(objectUrl)
        setIngestProgress(95)
        log.updateEntry(PREVIEW_ID, {
          status: 'done',
          progress: 100,
          label: 'preparing preview (native)',
          detail: hasLikelyUnsupportedAudioCodec
            ? `Source audio codec (${probe.audioCodec || 'unknown'}) may not decode in this browser; playback can be silent. Export path is unaffected.`
            : undefined,
        })
      } else {
        // transcode audio to aac for browser preview, stream-copy video for speed
        // limit to first 5 seconds to avoid long encode times
        const previewName = '_preview.mp4'
        try {
          await ffmpeg.exec([
            '-i', filename,
            '-t', '5',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            previewName,
          ])

          const data = await ffmpeg.readFile(previewName)
          const blob = new Blob([data as BlobPart], { type: 'video/mp4' })
          const previewUrl = URL.createObjectURL(blob)
          store.setPreviewUrl(previewUrl)
          setIngestProgress(95)
          log.updateEntry(PREVIEW_ID, {
            status: 'done',
            progress: 100,
            label: shouldForceTranscodedPreviewForAudio
              ? 'preparing preview (transcoded for audio compatibility)'
              : 'preparing preview (transcoded)',
            detail: shouldForceTranscodedPreviewForAudio
              ? `Source audio codec (${probe.audioCodec || 'unknown'}) is likely unsupported for native playback; preview audio was transcoded to AAC.`
              : undefined,
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
    stopStageTicker()
    store.setIngestionStatus('ready')
    log.updateEntry(INGEST_ID, {
      status: 'done',
      progress: 100,
    })
  } catch (err) {
    stopStageTicker()
    if (myId !== currentIngestId) return
    const msg = err instanceof Error ? err.message : String(err)
    store.setIngestionStatus('error')
    useLogStore.getState().updateEntry(INGEST_ID, {
      status: 'error',
      detail: msg,
      label: `ingest failed: ${file.name}`,
    })
    throw err instanceof Error ? err : new Error(msg)
  } finally {
    stopStageTicker()
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
