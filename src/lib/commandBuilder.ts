/** build ffmpeg cli args from editor state. */

import { useEditorStore } from '../stores/editorStore'
import { frameToTime } from './frameUtils'
import { resolveOutputExtension } from './outputFormats'
import type { OutputFormat } from '../types/editor'

function buildAtempoChain(value: number): string[] {
  const target = Math.max(0.25, Math.min(4, value))
  const filters: string[] = []
  let remaining = target

  while (remaining > 2.0) {
    filters.push('atempo=2')
    remaining /= 2
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5')
    remaining /= 0.5
  }

  filters.push(`atempo=${remaining.toFixed(4)}`)
  return filters
}

function normalizeEven(value: number): number {
  return value % 2 === 0 ? value : value - 1
}

function normalizeCropForCodec(
  crop: { x: number; y: number; width: number; height: number },
  codec: string,
  sourceW: number,
  sourceH: number,
) {
  if (!['libx264', 'mpeg4', 'libvpx-vp9'].includes(codec)) {
    return crop
  }

  const x = Math.max(0, normalizeEven(crop.x))
  const y = Math.max(0, normalizeEven(crop.y))
  const maxWidth = Math.max(2, sourceW - x)
  const maxHeight = Math.max(2, sourceH - y)
  const width = Math.max(2, Math.min(normalizeEven(crop.width), normalizeEven(maxWidth)))
  const height = Math.max(2, Math.min(normalizeEven(crop.height), normalizeEven(maxHeight)))

  return { x, y, width, height }
}

function clampCropToSource(
  crop: { x: number; y: number; width: number; height: number },
  sourceW: number,
  sourceH: number,
) {
  const minSize = 2
  const x = Math.max(0, Math.min(sourceW - minSize, crop.x))
  const y = Math.max(0, Math.min(sourceH - minSize, crop.y))
  const width = Math.max(minSize, Math.min(sourceW - x, crop.width))
  const height = Math.max(minSize, Math.min(sourceH - y, crop.height))
  return { x, y, width, height }
}

interface BuildResult {
  args: string[]
  outputName: string
  needsReencode: boolean
}

/** build ffmpeg args for the selected output format. */
export function buildCommand(format: OutputFormat): BuildResult {
  const state = useEditorStore.getState()
  const { probe, selections, crop, videoProps, audioProps } = state
  if (!probe) throw new Error('No file loaded')

  const fps = probe.fps
  const duration = probe.duration
  const totalFrames = fps > 0 ? Math.round(duration * fps) : 0
  const inputName = state.file!.name

  const sel = selections[0]
  const inFrame = sel?.start ?? 0
  const outFrame = sel?.end ?? Math.max(0, totalFrames - 1)
  const isTrimmed = inFrame > 0 || outFrame < totalFrames - 1
  const hasCrop = crop !== null
  const sourceW = probe.width
  const sourceH = probe.height

  const ext = resolveOutputExtension(format, probe.format, inputName)
  const isGifOutput = ext === 'gif'
  const baseName = inputName.replace(/\.[^.]+$/, '')
  const outputName = `${baseName}_out.${ext}`

  // determine if we need to re-encode
  const vCodecCopy = videoProps.codec === 'copy' && !hasCrop && !isGifOutput
  const hasFpsChange =
    videoProps.trackIndex !== null &&
    videoProps.fps !== null &&
    videoProps.fps > 0 &&
    fps > 0 &&
    videoProps.fps < fps - 0.0001
  const hasAudioFilters =
    audioProps.trackIndex !== null &&
    (Math.abs(audioProps.volume - 1) > 0.0001 || Math.abs(audioProps.speed - 1) > 0.0001 || Math.abs(audioProps.pitch) > 0.0001)
  const aCodecCopy = audioProps.codec === 'copy' && !hasAudioFilters && !isGifOutput
  const resolvedVideoCodec = isGifOutput ? 'gif' : (videoProps.codec === 'copy' ? 'libx264' : videoProps.codec)
  const resolvedAudioCodec = audioProps.codec === 'copy' ? 'aac' : audioProps.codec
  const forcedCropReencode = hasCrop && videoProps.codec === 'copy'

  // with -ss before -i, ffmpeg seeks to the nearest preceding
  // keyframe for stream-copy, so no keyframe analysis needed.
  const needsReencode = !vCodecCopy || hasCrop || hasFpsChange
  const useFastSeek = isGifOutput || !needsReencode
  const trimStart = isTrimmed && fps > 0 ? frameToTime(inFrame, fps) : null

  const args: string[] = []

  // for stream-copy, keep -ss before -i (fast seek).
  // for re-encode, place -ss after -i to avoid keyframe preroll drift.
  if (trimStart !== null && useFastSeek) {
    args.push('-ss', trimStart.toFixed(6))
  }

  args.push('-i', inputName)

  if (trimStart !== null && needsReencode && !useFastSeek) {
    args.push('-ss', trimStart.toFixed(6))
  }

  // explicit stream mapping prevents subtitle/data/attachment streams
  // from being auto-selected on containers like mkv during re-encode.
  if (videoProps.trackIndex !== null) {
    args.push('-map', `0:${videoProps.trackIndex}`)
  } else {
    args.push('-vn')
  }

  if (!isGifOutput && audioProps.trackIndex !== null) {
    args.push('-map', `0:${audioProps.trackIndex}?`)
  } else {
    args.push('-an')
  }

  args.push('-sn', '-dn')

  // duration (after -i)
  if (isTrimmed && fps > 0) {
    const selDuration = frameToTime(outFrame - inFrame + 1, fps)
    args.push('-t', selDuration.toFixed(6))
  }

  // video filters
  const vFilters: string[] = []
  const aFilters: string[] = []
  if (hasCrop) {
    const clamped = clampCropToSource({
      x: Math.round(crop.x),
      y: Math.round(crop.y),
      width: Math.round(crop.width),
      height: Math.round(crop.height),
    }, sourceW, sourceH)

    const normalized = normalizeCropForCodec(clamped, resolvedVideoCodec, sourceW, sourceH)
    vFilters.push(`crop=${normalized.width}:${normalized.height}:${normalized.x}:${normalized.y}`)
  }

  if (hasFpsChange) {
    vFilters.push(`fps=${videoProps.fps}`)
  }

  if (isGifOutput) {
    // browser/wasm gif encoding is expensive at source resolution and fps.
    // apply sane defaults unless user explicitly set output geometry/fps.
    const requestedGifFps = videoProps.gifFps && videoProps.gifFps > 0 ? videoProps.gifFps : 8
    const gifFps = fps > 0 ? Math.min(requestedGifFps, fps) : requestedGifFps
    vFilters.push(`fps=${gifFps}`)

    const hasExplicitGifSize = videoProps.gifWidth !== null || videoProps.gifHeight !== null
    if (!hasExplicitGifSize) {
      // keep gif generation fast: cap width and never upscale smaller crops.
      vFilters.push('scale=min(480\\,iw):-1:flags=fast_bilinear')
    } else {
      const gifW = videoProps.gifWidth !== null ? Math.max(1, Math.floor(videoProps.gifWidth)) : -1
      const gifH = videoProps.gifHeight !== null ? Math.max(1, Math.floor(videoProps.gifHeight)) : -1
      const useBoxFit = gifW !== -1 && gifH !== -1 && videoProps.keepAspectRatio
      vFilters.push(
        useBoxFit
          ? `scale=${gifW}:${gifH}:flags=fast_bilinear:force_original_aspect_ratio=decrease`
          : `scale=${gifW}:${gifH}:flags=fast_bilinear`,
      )
    }
  }

  if (!isGifOutput && audioProps.trackIndex !== null) {
    if (Math.abs(audioProps.pitch) > 0.0001 && probe.audioSampleRate > 0) {
      const factor = Math.pow(2, audioProps.pitch / 12)
      const targetRate = Math.max(1, Math.round(probe.audioSampleRate * factor))
      aFilters.push(`asetrate=${targetRate}`)
      aFilters.push(`aresample=${probe.audioSampleRate}`)
      aFilters.push(...buildAtempoChain(1 / factor))
    }
    if (Math.abs(audioProps.speed - 1) > 0.0001) {
      aFilters.push(...buildAtempoChain(audioProps.speed))
    }
    if (Math.abs(audioProps.volume - 1) > 0.0001) {
      aFilters.push(`volume=${audioProps.volume.toFixed(3)}`)
    }
  }

  // video codec
  if (needsReencode) {
    const codec = resolvedVideoCodec
    if (codec === 'libx264') {
      args.push('-c:v', codec)
      args.push('-preset', forcedCropReencode ? 'ultrafast' : videoProps.preset)
      args.push('-crf', String(videoProps.crf))
      args.push('-pix_fmt', 'yuv420p')
      // single-thread x264 is more stable in wasm/pthreads edge cases.
      args.push('-threads', '1')
      if (videoProps.profile) {
        args.push('-profile:v', videoProps.profile)
      }
    } else if (codec === 'libvpx-vp9') {
      args.push('-c:v', codec)
      args.push('-crf', String(videoProps.crf))
      args.push('-b:v', '0')
    } else if (codec === 'gif') {
      args.push('-c:v', 'gif')
      args.push('-threads', '1')
      args.push('-filter_threads', '1')
    } else {
      args.push('-c:v', codec)
    }
  } else {
    args.push('-c:v', 'copy')
  }

  // audio codec
  if (isGifOutput) {
    // gif does not support audio.
  } else if (aCodecCopy) {
    args.push('-c:a', 'copy')
  } else {
    args.push('-c:a', resolvedAudioCodec)
    args.push('-b:a', `${audioProps.bitrate}k`)
  }

  // apply video filters
  if (vFilters.length > 0) {
    args.push('-vf', vFilters.join(','))
  }
  if (aFilters.length > 0 && !isGifOutput) {
    args.push('-af', aFilters.join(','))
  }

  // format-specific flags
  if (ext === 'mp4') {
    args.push('-movflags', '+faststart')
  }

  args.push('-y', outputName)

  return { args, outputName, needsReencode }
}
