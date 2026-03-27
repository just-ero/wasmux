/** run the export pipeline. */

import { getFFmpeg, resetFFmpeg } from '@/lib/ffmpeg'
import { buildCommand } from '@/lib/commandBuilder'
import { useEditorStore } from '@/stores/editorStore'
import { useLogStore } from '@/stores/logStore'
import type { NativeFileHandle } from '@/types/editor'
import type { OutputFormat } from '@/types/editor'
import type { ProgressEvent } from '@ffmpeg/ffmpeg'
import { isErrorOutputLine } from '@/core/output/normalize'
import { appendJobOutput, bindFFmpegJobOutput } from '@/lib/jobOutput'
import { isSupportedOutputExtension, resolveOutputExtension } from '@/lib/outputFormats'
import { showNativeSaveFilePicker, supportsNativeSaveFilePicker } from '@/lib/fileSystemAccess'

function getPickerAccept(extension: Exclude<OutputFormat, 'source'>): Record<string, string[]> {
  // use octet-stream so chrome does not silently hide uncommon extensions.
  // the extension list is what the picker actually uses.
  return { 'application/octet-stream': [`.${extension}`] }
}

function createExportId(): string {
  return `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function makeStepId(exportId: string, step: 'prepare' | 'encode' | 'finalize' | 'cleanup') {
  return `${exportId}:${step}`
}

const EXPORT_RETRY_POLICY = {
  stallWarnSeconds: {
    gif: 120,
    default: 180,
  },
  stallResetSeconds: {
    gif: 75,
    default: 0,
  },
  gifProgressEstimateFactor: 12,
} as const

type FallbackKind = 'gif' | 'webm' | 'safe'

interface FallbackPlan {
  kind: FallbackKind
  outputName: string
  args: string[]
  detail: string
  message: string
}

export function isWasmMemoryFault(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return /memory access out of bounds|out of memory|wasm memory/i.test(text)
}

const encodeSuppressedPrefixes = [
  'ffmpeg version',
  '  built with',
  '  configuration:',
  '  libav',
  '  libsw',
  '  libpostproc',
  '  Metadata:',
  '    BPS',
  '    DURATION',
  '    NUMBER_OF_',
  '    _STATISTICS_',
]

function isPrimaryEncodeStreamLine(line: string): boolean {
  return /Stream\s+#\d+:(0|1)(?:\[[^\]]+\])?(?:\([^)]*\))?:\s+/i.test(line)
}

/** Filter FFmpeg args to show only non-default options. Preserves -i input and output. */
function filterDefaultArgs(args: string[]): string[] {
  const filtered: string[] = []
  const defaultValues: Record<string, Set<string>> = {
    '-pix_fmt': new Set(['yuv420p']),
    '-sn': new Set(['true']),
    '-dn': new Set(['true']),
    '-threads': new Set(['0']), // 0 means auto
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    // Always keep -i (input marker)
    if (arg === '-i') {
      filtered.push(arg)
      if (i + 1 < args.length) {
        filtered.push(args[++i])
      }
      continue
    }

    // Last item is usually output filename, always keep
    if (i === args.length - 1) {
      filtered.push(arg)
      continue
    }

    // Check if this is a known default single-value option
    if (defaultValues[arg] && i + 1 < args.length) {
      const value = args[i + 1]
      if (!value.startsWith('-') && defaultValues[arg].has(value)) {
        i++ // skip the value too
        continue
      }
    }

    filtered.push(arg)
  }

  return filtered
}

export function shouldDisplayEncodeLogLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false

  const lower = trimmed.toLowerCase()
  if (encodeSuppressedPrefixes.some((prefix) => lower.startsWith(prefix.toLowerCase()))) {
    return false
  }

  if (/^Input\s+#\d+,/i.test(trimmed)) return true
  if (/^Duration:/i.test(trimmed)) return true
  if (isPrimaryEncodeStreamLine(trimmed)) return true
  if (/^Stream mapping:/i.test(trimmed)) return true
  if (/^frame=|\btime=|^progress=|^out_time_ms=/i.test(trimmed)) return true
  if (isErrorOutputLine(trimmed)) return true

  return false
}

export function parseProgressSeconds(message: string): number | null {
  const progressMatch = /time=\s*(\d+):(\d+):(\d+)(?:\.(\d+))?/.exec(message)
  if (progressMatch) {
    const hours = Number.parseInt(progressMatch[1], 10)
    const minutes = Number.parseInt(progressMatch[2], 10)
    const seconds = Number.parseInt(progressMatch[3], 10)
    if (minutes >= 60 || seconds >= 60) return null

    const fractionDigits = progressMatch[4] ?? ''
    const fraction = fractionDigits.length > 0 ? Number(`0.${fractionDigits}`) : 0
    if (!Number.isFinite(fraction)) return null
    return hours * 3600 + minutes * 60 + seconds + fraction
  }

  const outTimeMatch = /out_time_ms=(\d+)/.exec(message)
  if (outTimeMatch) {
    return Number.parseInt(outTimeMatch[1], 10) / 1_000_000
  }

  return null
}

function extractFallbackArgs(
  args: string[],
  options: {
    removePairFlags: Set<string>
    captureVf?: boolean
    captureAf?: boolean
  },
): { passthrough: string[]; sourceVf: string | null; sourceAf: string | null } {
  const passthrough: string[] = []
  let sourceVf: string | null = null
  let sourceAf: string | null = null

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]
    if (token === '-y') break

    if (options.captureVf && token === '-vf') {
      sourceVf = args[i + 1] ?? null
      i += 1
      continue
    }

    if (options.captureAf && token === '-af') {
      sourceAf = args[i + 1] ?? null
      i += 1
      continue
    }

    if (options.removePairFlags.has(token)) {
      i += 1
      continue
    }

    passthrough.push(token)
  }

  return { passthrough, sourceVf, sourceAf }
}

export function buildSafeFallbackArgs(args: string[], fallbackOutputName: string): string[] {
  const removePairFlags = new Set([
    '-c:v',
    '-preset',
    '-crf',
    '-profile:v',
    '-pix_fmt',
    '-threads',
    '-c:a',
    '-b:a',
    '-movflags',
  ])

  const { passthrough } = extractFallbackArgs(args, { removePairFlags })

  return [
    ...passthrough,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '30',
    '-pix_fmt', 'yuv420p',
    '-threads', '1',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y', fallbackOutputName,
  ]
}

export function buildGifFallbackArgs(args: string[], fallbackOutputName: string): string[] {
  const { passthrough, sourceVf } = extractFallbackArgs(args, {
    removePairFlags: new Set(['-c:v', '-threads', '-filter_threads']),
    captureVf: true,
  })

  const cropFilter = sourceVf
    ?.split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith('crop='))
  const fallbackVf = [cropFilter, 'fps=5', 'scale=min(320\\,iw):-1:flags=fast_bilinear']
    .filter(Boolean)
    .join(',')

  return [
    ...passthrough,
    '-c:v', 'gif',
    '-threads', '1',
    '-filter_threads', '1',
    '-vf', fallbackVf,
    '-y', fallbackOutputName,
  ]
}

export function buildWebmFallbackArgs(args: string[], fallbackOutputName: string): string[] {
  const { passthrough, sourceVf, sourceAf } = extractFallbackArgs(args, {
    removePairFlags: new Set([
      '-c:v',
      '-c:a',
      '-b:v',
      '-b:a',
      '-crf',
      '-ac',
      '-threads',
      '-filter_threads',
    ]),
    captureVf: true,
    captureAf: true,
  })

  const vf = sourceVf ?? 'scale=min(1280\\,iw):-2:flags=fast_bilinear'

  return [
    ...passthrough,
    '-c:v', 'libvpx',
    '-deadline', 'realtime',
    '-cpu-used', '8',
    '-crf', '40',
    '-b:v', '1M',
    '-c:a', 'libvorbis',
    '-b:a', '128k',
    '-ac', '2',
    ...(sourceAf ? ['-af', sourceAf] : []),
    '-vf', vf,
    '-y', fallbackOutputName,
  ]
}

function buildFallbackPlan(
  args: string[],
  currentOutputName: string,
  options: {
    isGifExport: boolean
    isWebmExport: boolean
    canRetryFromMemoryFault: boolean
  },
): FallbackPlan {
  if (options.isGifExport) {
    const outputName = currentOutputName.replace(/\.[^.]+$/, '.gif')
    return {
      kind: 'gif',
      outputName,
      args: buildGifFallbackArgs(args, outputName),
      detail: 'Primary GIF encode stalled. Retrying once with a fallback profile (fps 5, max width 320).',
      message: 'Retrying once with GIF fallback profile (fps 5, max width 320)...',
    }
  }

  if (options.isWebmExport) {
    const outputName = currentOutputName.replace(/\.[^.]+$/, '.webm')
    return {
      kind: 'webm',
      outputName,
      args: buildWebmFallbackArgs(args, outputName),
      detail: options.canRetryFromMemoryFault
        ? 'Primary WebM encode hit WASM memory limits. Retrying once with a lower-memory WebM fallback profile (VP8/Vorbis, downscaled).'
        : 'Primary WebM encode stalled. Retrying once with a faster WebM fallback profile (VP8/Vorbis).',
      message: options.canRetryFromMemoryFault
        ? 'Retrying once with lower-memory WebM fallback profile (vp8/vorbis, downscaled, realtime)...'
        : 'Retrying once with WebM fallback profile (vp8/vorbis, realtime)...',
    }
  }

  const outputName = currentOutputName.replace(/\.[^.]+$/, '.mp4')
  return {
    kind: 'safe',
    outputName,
    args: buildSafeFallbackArgs(args, outputName),
    detail: 'Primary encode stalled. Retrying with fallback profile (mp4/libx264/aac).',
    message: 'Retrying with fallback profile (mp4/libx264/aac)...',
  }
}

async function restoreInputFileInFs(ffmpeg: Awaited<ReturnType<typeof getFFmpeg>>, inputName: string, objectUrl: string): Promise<void> {
  const response = await fetch(objectUrl)
  if (!response.ok) {
    throw new Error(`Failed to reload source media for retry (${response.status} ${response.statusText}).`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  await ffmpeg.writeFile(inputName, bytes)
}

/** run one full export cycle. */
interface ExportOptions {
  target?: ExportTarget
}

export async function exportFile(options?: ExportOptions): Promise<void> {
  const store = useEditorStore.getState()
  const log = useLogStore.getState()
  const exportId = createExportId()

  if (!store.file || !store.probe) return
  if (store.isExporting) return

  const pickerResult = options?.target
     ?? await chooseExportTarget(store.file.name, store.file.sourceHandle ?? null, store.probe.format, store.outputFormat)
  if (!pickerResult) return

  const { format, fileHandle, fileName } = pickerResult
  const isGifExport = format === 'gif'
  const isWebmExport = format === 'webm'
  const stallWarnSeconds = isGifExport ? EXPORT_RETRY_POLICY.stallWarnSeconds.gif : EXPORT_RETRY_POLICY.stallWarnSeconds.default
  const stallResetSeconds = isGifExport ? EXPORT_RETRY_POLICY.stallResetSeconds.gif : EXPORT_RETRY_POLICY.stallResetSeconds.default
  const allowSafeFallbackRetry = isGifExport

  store.setExporting(true)

  const duration = store.probe.duration
  const fps = store.probe.fps
  const sel = store.selections[0]
  const selDuration = sel && fps > 0 ? Math.max(1 / fps, (sel.end - sel.start + 1) / fps) : duration

  log.addEntry({
    id: exportId,
    label: 'exporting',
    status: 'running',
    progress: 0,
    children: [],
  })

  const prepareId = makeStepId(exportId, 'prepare')
  const encodeId = makeStepId(exportId, 'encode')
  const finalizeId = makeStepId(exportId, 'finalize')
  const cleanupId = makeStepId(exportId, 'cleanup')

  log.addChild(exportId, {
    id: prepareId,
    label: 'prepare command',
    status: 'running',
    progress: 0,
    children: [],
  })
  log.addChild(exportId, {
    id: encodeId,
    label: 'encode media',
    status: 'pending',
    progress: 0,
    children: [],
  })
  log.addChild(exportId, {
    id: finalizeId,
    label: 'save output file',
    status: 'pending',
    progress: 0,
    children: [],
  })
  log.addChild(exportId, {
    id: cleanupId,
    label: 'cleanup temp files',
    status: 'pending',
    progress: 0,
    children: [],
  })

  let activeStepId: string = prepareId

  try {
    const ffmpeg = await getFFmpeg()
    let activeFFmpeg = ffmpeg

    const { args, outputName, needsReencode } = buildCommand(format)
    let currentOutputName = outputName

    // Show full command for reference, but in a cleaner form with defaults omitted
    const displayArgs = filterDefaultArgs([...args])
    appendJobOutput(prepareId, `ffmpeg ${displayArgs.join(' ')}`, 'stdout')

    // Warn about WebM encoding performance in wasm
    if (outputName.endsWith('.webm')) {
      appendJobOutput(prepareId, `⚠ WebM encoding is slower in wasm browser. Consider exporting to MP4 or running this command locally for faster results.`, 'stderr')
    }

    log.updateEntry(prepareId, { status: 'done', progress: 100 })

    if (needsReencode) {
      log.updateEntry(exportId, { label: 'exporting (re-encoding)' })
      log.updateEntry(encodeId, { label: 'encode media (re-encoding)' })
    } else {
      log.updateEntry(exportId, { label: 'exporting (stream copy)' })
      log.updateEntry(encodeId, { label: 'encode media (stream copy)' })
    }

    activeStepId = encodeId
    log.updateEntry(encodeId, { status: 'running' })

    // this listener tracks forward movement and helps detect stalled encodes.
    let lastProgress = -1
    let lastActivityAt = Date.now()
    let lastHeartbeatReported = 0
    let encodeStartedAt = Date.now()
    let stalled = false
    let retrying = false

    const executeEncode = async (ffmpegInstance: Awaited<ReturnType<typeof getFFmpeg>>, execArgs: string[]) => {
      encodeStartedAt = Date.now()
      const heartbeat = window.setInterval(() => {
        const idleSec = Math.floor((Date.now() - lastActivityAt) / 1000)
        if (idleSec < 15) return
        if (idleSec - lastHeartbeatReported < 15) return
        lastHeartbeatReported = idleSec

        if (isGifExport && selDuration > 0 && lastProgress < 95) {
          // gif progress from ffmpeg can be sparse in wasm. provide a conservative
          // fallback estimate based on elapsed wall time so users see movement.
          const elapsedSec = Math.max(1, Math.floor((Date.now() - encodeStartedAt) / 1000))
          const estimatedTotalSec = Math.max(20, Math.ceil(selDuration * EXPORT_RETRY_POLICY.gifProgressEstimateFactor))
          const estimatedPct = Math.min(85, Math.max(1, Math.round((elapsedSec / estimatedTotalSec) * 100)))
          if (estimatedPct > lastProgress) {
            lastProgress = estimatedPct
            log.updateEntry(exportId, { progress: estimatedPct })
            log.updateEntry(encodeId, { progress: estimatedPct })
          }
        }

        appendJobOutput(encodeId, `still running; waiting for new encoder output (${idleSec}s idle)`, 'info')

        if (idleSec >= stallWarnSeconds) {
          appendJobOutput(
            encodeId,
            `${isGifExport ? 'GIF' : 'Encoding'} in browser can be slow; still processing (${idleSec}s idle, no new ffmpeg frame/progress events).`,
            'info',
          )
        }

        if (stallResetSeconds > 0 && idleSec >= stallResetSeconds && !stalled && allowSafeFallbackRetry) {
          stalled = true
          retrying = true
          appendJobOutput(encodeId, 'encoder appears stalled; restarting encode worker', 'info')
          log.updateEntry(encodeId, {
            detail: `No encoder output for ${idleSec}s; forcing restart and retry.`,
          })
          resetFFmpeg()
        }
      }, 5000)

      const onLine = ({ message }: { message: string }) => {
        lastActivityAt = Date.now()

        if (selDuration > 0) {
          const secs = parseProgressSeconds(message)
          if (secs !== null) {
            const pct = Math.min(100, Math.max(0, Math.round((secs / selDuration) * 100)))
            if (pct !== lastProgress) {
              lastProgress = pct
              log.updateEntry(exportId, { progress: pct })
              log.updateEntry(encodeId, { progress: pct })
            }
          }
        }

        if (message.includes('progress=end')) {
          log.updateEntry(exportId, { progress: 100 })
          log.updateEntry(encodeId, { progress: 100 })
        }

        if (isErrorOutputLine(message) && !retrying) {
          log.updateEntry(exportId, { status: 'error' })
        }
      }

    const onProgress = ({ progress }: ProgressEvent) => {
      lastActivityAt = Date.now()
      if (!Number.isFinite(progress)) return
      const pct = Math.min(100, Math.max(0, Math.round(progress * 100)))
      if (pct > lastProgress) {
        lastProgress = pct
        log.updateEntry(exportId, { progress: pct })
        log.updateEntry(encodeId, { progress: pct })
      }
    }

      const detachLog = bindFFmpegJobOutput(ffmpegInstance, encodeId, onLine, shouldDisplayEncodeLogLine)
      ffmpegInstance.on('progress', onProgress)
      try {
        await ffmpegInstance.exec(['-progress', 'pipe:1', ...execArgs])
      } finally {
        detachLog()
        ffmpegInstance.off('progress', onProgress)
        window.clearInterval(heartbeat)
      }
    }

    try {
      await executeEncode(ffmpeg, args)
    } catch (err) {
      const canRetryFromMemoryFault = isWebmExport && needsReencode && !retrying && isWasmMemoryFault(err)
      if ((!stalled && !canRetryFromMemoryFault) || !needsReencode) throw err

      const fallbackPlan = buildFallbackPlan(args, currentOutputName, {
        isGifExport,
        isWebmExport,
        canRetryFromMemoryFault,
      })
      currentOutputName = fallbackPlan.outputName

      log.updateEntry(encodeId, {
        status: 'running',
        detail: fallbackPlan.detail,
      })
      appendJobOutput(encodeId, fallbackPlan.message, 'info')

      stalled = false
      retrying = false
      lastActivityAt = Date.now()
      lastHeartbeatReported = 0
      lastProgress = 0
      log.updateEntry(exportId, { progress: 0 })
      log.updateEntry(encodeId, { progress: 0 })

      const retryFFmpeg = await getFFmpeg()
      activeFFmpeg = retryFFmpeg
      await restoreInputFileInFs(retryFFmpeg, store.file.name, store.file.objectUrl)
      appendJobOutput(encodeId, 'Restored source file after worker restart. Continuing retry...', 'info')
      await executeEncode(retryFFmpeg, fallbackPlan.args)
    }

    log.updateEntry(encodeId, { status: 'done', progress: 100 })

    activeStepId = finalizeId
    log.updateEntry(finalizeId, { status: 'running' })

    // read output + trigger download
    let data: Uint8Array
    try {
      data = await activeFFmpeg.readFile(currentOutputName) as Uint8Array
    } catch (readErr) {
      const readMsg = readErr instanceof Error ? readErr.message : String(readErr)
      throw new Error(
        `Final output file was not found in WASM FS (${currentOutputName}). ` +
        `Possible causes: stream map mismatch or crop bounds that produced no output. ` +
        `Read error: ${readMsg}`,
      )
    }

    if (!data || data.length === 0) {
      throw new Error('Export produced an empty file. The encode likely failed.')
    }
    const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' })
    await writeExportedFile(blob, fileHandle, fileName)

    log.updateEntry(finalizeId, { status: 'done', progress: 100 })

    activeStepId = cleanupId
    log.updateEntry(cleanupId, { status: 'running' })

    // cleanup wasm fs
    await activeFFmpeg.deleteFile(currentOutputName).catch(() => {})
    log.updateEntry(cleanupId, { status: 'done', progress: 100 })

    log.updateEntry(exportId, {
      status: 'done',
      progress: 100,
      detail: undefined,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.updateEntry(activeStepId, {
      status: 'error',
      detail: msg,
    })
    log.updateEntry(exportId, {
      status: 'error',
      detail: msg,
      label: 'export failed',
    })
  } finally {
    useEditorStore.getState().setExporting(false)
  }
}

export interface ExportTarget {
  fileHandle: NativeFileHandle | null
  fileName: string
  format: OutputFormat
}

function getBaseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '')
}

function inferFormatFromFileName(filename: string): OutputFormat {
  const match = /\.([^.]+)$/.exec(filename.toLowerCase())
  if (!match) return 'source'

  const ext = match[1]
  if (isSupportedOutputExtension(ext)) {
    return ext
  }

  return 'source'
}

export async function pickExportTarget(
  sourceFileName: string,
  sourceHandle: NativeFileHandle | null,
  sourceFormat: string | undefined,
  chosenFormat: OutputFormat,
): Promise<ExportTarget | null> {
  return chooseExportTarget(sourceFileName, sourceHandle, sourceFormat, chosenFormat)
}

function resolveSaveStartIn(sourceHandle: NativeFileHandle | null): NativeFileHandle | 'downloads' {
  // If we have a native source handle, start in that file's directory.
  // Otherwise use downloads as the closest cross-browser fallback.
  return sourceHandle ?? 'downloads'
}

async function chooseExportTarget(
  sourceFileName: string,
  sourceHandle: NativeFileHandle | null,
  sourceFormat: string | undefined,
  chosenFormat: OutputFormat,
): Promise<ExportTarget | null> {
  const ext = resolveOutputExtension(chosenFormat, sourceFormat, sourceFileName)
  const suggestedName = `${getBaseName(sourceFileName)}-wasmux.${ext}`

  if (supportsNativeSaveFilePicker()) {
    const selection = await showNativeSaveFilePicker({
      suggestedName,
      startIn: resolveSaveStartIn(sourceHandle),
      types: [{
        description: `.${ext}`,
        accept: getPickerAccept(ext),
      }],
    })

    if (!selection) return null

    return {
      fileHandle: selection.handle,
      fileName: selection.handle.name,
      format: inferFormatFromFileName(selection.handle.name),
    }
  }

  return {
    fileHandle: null,
    fileName: suggestedName,
    format: chosenFormat,
  }
}

async function writeExportedFile(blob: Blob, fileHandle: ExportTarget['fileHandle'], fileName: string): Promise<void> {
  if (fileHandle?.createWritable) {
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    return
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
