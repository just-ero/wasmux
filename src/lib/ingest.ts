/** file ingest pipeline from ui input to ready preview. */

import { fetchFile } from '@ffmpeg/util'
import type { ProgressEvent } from '@ffmpeg/ffmpeg'
import { getFFmpeg, cancelExec, setExecRunning } from '@/lib/ffmpeg'
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

function normalizeCodecName(codec: string): string {
  return codec.trim().toLowerCase()
}

function canLikelyPlayNativeAudioCodec(codec: string): boolean {
  const normalized = normalizeCodecName(codec)
  return normalized === 'aac'
    || normalized === 'mp3'
    || normalized === 'opus'
    || normalized === 'vorbis'
    || normalized === 'flac'
    || normalized === 'alac'
    || normalized.startsWith('pcm_')
}

function canLikelyPlayNativeVideoSource(videoCodec: string, format: string): boolean {
  const codec = normalizeCodecName(videoCodec)
  const container = normalizeCodecName(format)

  // Browsers do not reliably play GIF via <video>; use a compatibility preview.
  if (codec === 'gif' || container.includes('gif')) return false

  return codec === 'h264'
    || codec === 'vp8'
    || codec === 'vp9'
    || codec === 'av1'
    || codec === 'theora'
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
  cancelExec()
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
  cancelExec()
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
          detail: undefined,
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
          detail: undefined,
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
    startStageTicker(98, 1, 450)

    if (probe.videoTracks.length === 0) {
      store.setPreviewUrl(null)
      setIngestProgress(95)
      log.updateEntry(PREVIEW_ID, {
        status: 'done',
        progress: 100,
        label: 'preparing preview',
      })
    } else {
      const hasAudioTrack = probe.audioTracks.length > 0
      const needsAudioCompatPreview = hasAudioTrack && !canLikelyPlayNativeAudioCodec(probe.audioCodec)
      const needsVideoCompatPreview = !canLikelyPlayNativeVideoSource(probe.videoCodec, probe.format)
      const needsCompatPreview = needsAudioCompatPreview || needsVideoCompatPreview

      if (!needsCompatPreview) {
        // Use source file directly for fastest startup.
        store.setPreviewUrl(objectUrl)
        setIngestProgress(95)
        log.updateEntry(PREVIEW_ID, {
          status: 'done',
          progress: 100,
          label: 'preparing preview',
        })
      } else {
        // Browser compatibility preview:
        // - transcode GIF-like video sources to h264 for <video>
        // - transcode unsupported audio codecs to aac
        const previewName = '_preview_compat.mp4'
        stopStageTicker()
        let sawProgress = false
        let lastProgressAt = Date.now()
        const waitingTicker = setInterval(() => {
          if (myId !== currentIngestId) return
          if (sawProgress) return
          const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastProgressAt) / 1000))
          log.updateEntry(PREVIEW_ID, {
            label: `preparing preview (${elapsedSeconds}s)`,
          })
          // Keep ingest progress moving slowly while waiting for first ffmpeg progress sample.
          setIngestProgress(Math.min(99, 95 + Math.floor(elapsedSeconds / 3)))
        }, 1000)
        const onPreviewProgress = ({ progress }: ProgressEvent) => {
          if (!Number.isFinite(progress)) return
          sawProgress = true
          lastProgressAt = Date.now()
          const clamped = Math.min(1, Math.max(0, progress))
          log.updateEntry(PREVIEW_ID, {
            progress: Math.round(clamped * 100),
            label: 'preparing preview',
          })
          const overall = Math.round(80 + clamped * 19)
          setIngestProgress(overall)
        }
        ffmpeg.on('progress', onPreviewProgress)
        try {
          const videoTrackIndex = probe.videoTracks[0]?.index ?? 0
          const audioTrackIndex = probe.audioTracks[0]?.index ?? 0
          const previewArgs = [
            '-progress', 'pipe:1',
            '-i', filename,
            '-map', `0:${videoTrackIndex}`,
          ]

          if (hasAudioTrack) {
            previewArgs.push('-map', `0:${audioTrackIndex}`)
          }

          if (needsVideoCompatPreview) {
            previewArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p')
          } else {
            previewArgs.push('-c:v', 'copy')
          }

          if (hasAudioTrack) {
            previewArgs.push('-c:a', needsAudioCompatPreview ? 'aac' : 'copy')
          } else {
            previewArgs.push('-an')
          }

          previewArgs.push('-movflags', '+faststart', previewName)

          setExecRunning(true)
          await ffmpeg.exec(previewArgs)

          const data = await ffmpeg.readFile(previewName)
          const blob = new Blob([data as BlobPart], { type: 'video/mp4' })
          const previewUrl = URL.createObjectURL(blob)
          store.setPreviewUrl(previewUrl)
          setIngestProgress(95)
          log.updateEntry(PREVIEW_ID, {
            status: 'done',
            progress: 100,
            label: 'preparing preview',
          })
        } catch {
          // Fall back to source preview if compatibility transcode fails.
          store.setPreviewUrl(objectUrl)
          setIngestProgress(95)
          log.updateEntry(PREVIEW_ID, {
            status: 'done',
            progress: 100,
            label: 'preparing preview',
          })
        } finally {
          setExecRunning(false)
          clearInterval(waitingTicker)
          ffmpeg.off('progress', onPreviewProgress)
          await ffmpeg.deleteFile(previewName).catch(() => {})
        }
      }
    }

    if (myId !== currentIngestId) return

    // done
    stopStageTicker()
    store.setIngestionStatus('ready')
    store.setActiveTab('video')
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

