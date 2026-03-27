/** build ffmpeg cli args from editor state. */

import { useEditorStore } from '@/stores/editorStore'
import { frameToTime, totalFramesFromDuration } from '@/lib/frameUtils'
import { resolveOutputExtension } from '@/lib/outputFormats'
import type { OutputFormat } from '@/types/editor'

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
  if (!['libx264', 'mpeg4', 'libvpx-vp9', 'libvpx'].includes(codec)) {
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

function hasEvenDimensionRequirement(codec: string): boolean {
  return codec === 'libx264' || codec === 'mpeg4' || codec === 'libvpx-vp9' || codec === 'libvpx'
}

function normalizeRequestedDimension(value: number | null, codec: string): number | null {
  if (value === null) return null
  const floored = Math.max(1, Math.floor(value))
  if (!hasEvenDimensionRequirement(codec)) return floored
  return floored % 2 === 0 ? floored : Math.max(2, floored - 1)
}

const COARSE_REENCODE_SEEK_LEAD_SECONDS = 8

function resolveWebmBaselineCrf(uiCrf: number): number {
  // libvpx CRF scale differs from x264; map UI defaults to a sane quality band.
  return Math.max(20, Math.min(42, Math.round(uiCrf + 8)))
}

interface BuildResult {
  args: string[]
  outputName: string
  needsReencode: boolean
}

interface ContainerCodecProfile {
  sourceVideoStreamCopyCodecs: Set<string>
  sourceAudioStreamCopyCodecs: Set<string>
  explicitVideoEncoderCodecs: Set<string>
  explicitAudioEncoderCodecs: Set<string>
  defaultVideoCodec: string
  defaultAudioCodec: string
}

function normalizeCodecName(codec: string | undefined): string {
  return (codec ?? '').trim().toLowerCase()
}

const WEBM_PROFILE: ContainerCodecProfile = {
  sourceVideoStreamCopyCodecs: new Set(['vp8', 'vp9', 'av1']),
  sourceAudioStreamCopyCodecs: new Set(['opus', 'vorbis']),
  explicitVideoEncoderCodecs: new Set(['libvpx', 'libvpx-vp9', 'libaom-av1']),
  explicitAudioEncoderCodecs: new Set(['libvorbis', 'libopus']),
  defaultVideoCodec: 'libvpx',
  defaultAudioCodec: 'libvorbis',
}

function getContainerCodecProfile(ext: string): ContainerCodecProfile | null {
  if (ext === 'webm') return WEBM_PROFILE
  return null
}

function isVideoStreamCopyCompatibleWithContainer(ext: string, sourceVideoCodec: string, hasVideoTrack: boolean): boolean {
  if (!hasVideoTrack) return true
  const profile = getContainerCodecProfile(ext)
  if (!profile) return true
  return profile.sourceVideoStreamCopyCodecs.has(normalizeCodecName(sourceVideoCodec))
}

function isAudioStreamCopyCompatibleWithContainer(ext: string, sourceAudioCodec: string, hasAudioTrack: boolean): boolean {
  if (!hasAudioTrack) return true
  const profile = getContainerCodecProfile(ext)
  if (!profile) return true
  return profile.sourceAudioStreamCopyCodecs.has(normalizeCodecName(sourceAudioCodec))
}

function defaultVideoCodecForContainer(ext: string): string {
  const profile = getContainerCodecProfile(ext)
  return profile?.defaultVideoCodec ?? 'libx264'
}

function defaultAudioCodecForContainer(ext: string): string {
  const profile = getContainerCodecProfile(ext)
  return profile?.defaultAudioCodec ?? 'aac'
}

function isExplicitVideoCodecCompatibleWithContainer(ext: string, codec: string): boolean {
  const profile = getContainerCodecProfile(ext)
  if (!profile) return true
  return profile.explicitVideoEncoderCodecs.has(normalizeCodecName(codec))
}

function isExplicitAudioCodecCompatibleWithContainer(ext: string, codec: string): boolean {
  const profile = getContainerCodecProfile(ext)
  if (!profile) return true
  return profile.explicitAudioEncoderCodecs.has(normalizeCodecName(codec))
}

/** build ffmpeg args for the selected output format. */
export function buildCommand(format: OutputFormat): BuildResult {
  const state = useEditorStore.getState()
  const { probe, selections, crop, videoProps, audioProps } = state
  if (!probe) throw new Error('No file loaded')

  const fps = probe.fps
  const duration = probe.duration
  const totalFrames = totalFramesFromDuration(duration, fps)
  const inputName = state.file!.name

  const sel = selections[0]
  const inFrame = sel?.start ?? 0
  const outFrame = sel?.end ?? Math.max(0, totalFrames - 1)
  const isTrimmed = inFrame > 0 || outFrame < totalFrames - 1
  const hasVideoTrack = videoProps.trackIndex !== null
  const hasCrop = hasVideoTrack && crop !== null
  const sourceW = probe.width
  const sourceH = probe.height

  const ext = resolveOutputExtension(format, probe.format, inputName)
  const isGifOutput = ext === 'gif'
  const baseName = inputName.replace(/\.[^.]+$/, '')
  const outputName = `${baseName}_out.${ext}`
  const hasAudioTrack = !isGifOutput && audioProps.trackIndex !== null
  const canCopyVideoForContainer = isVideoStreamCopyCompatibleWithContainer(ext, probe.videoCodec, hasVideoTrack)
  const canCopyAudioForContainer = isAudioStreamCopyCompatibleWithContainer(ext, probe.audioCodec, hasAudioTrack)

  // determine if we need to re-encode
  const vCodecCopy = videoProps.codec === 'copy' && !hasCrop && !isGifOutput && canCopyVideoForContainer
  const hasFpsChange =
    videoProps.trackIndex !== null &&
    videoProps.fps !== null &&
    videoProps.fps > 0 &&
    !isGifOutput
  const hasScaleChange =
    videoProps.trackIndex !== null &&
    ((videoProps.width !== null && videoProps.width > 0) || (videoProps.height !== null && videoProps.height > 0))
  const hasAudioFilters =
    audioProps.trackIndex !== null &&
    (Math.abs(audioProps.volume - 1) > 0.0001 || Math.abs(audioProps.speed - 1) > 0.0001 || Math.abs(audioProps.pitch) > 0.0001)
  const aCodecCopy = hasAudioTrack && audioProps.codec === 'copy' && !hasAudioFilters && canCopyAudioForContainer
  const requestedVideoCodec = videoProps.codec === 'copy' ? defaultVideoCodecForContainer(ext) : videoProps.codec
  const resolvedVideoCodec = isGifOutput
    ? 'gif'
    : (isExplicitVideoCodecCompatibleWithContainer(ext, requestedVideoCodec) ? requestedVideoCodec : defaultVideoCodecForContainer(ext))
  const requestedAudioCodec = audioProps.codec === 'copy' ? defaultAudioCodecForContainer(ext) : audioProps.codec
  const resolvedAudioCodec = isExplicitAudioCodecCompatibleWithContainer(ext, requestedAudioCodec)
    ? requestedAudioCodec
    : defaultAudioCodecForContainer(ext)
  const forcedCropReencode = hasCrop && videoProps.codec === 'copy'

  // with -ss before -i, ffmpeg seeks to the nearest preceding
  // keyframe for stream-copy, so no keyframe analysis needed.
  // if preciseFrameCuts is enabled, force re-encode for exact frame cutting.
  // fastExport overrides preciseFrameCuts to enable keyframe snapping for speed.
  const effectivePreciseFrameCuts = videoProps.preciseFrameCuts && !videoProps.fastExport
  const forcedPreciseTrimReencode = effectivePreciseFrameCuts && isTrimmed && videoProps.codec === 'copy'
  const needsAudioReencode = hasAudioTrack && !aCodecCopy
  const needsReencode = !vCodecCopy || hasCrop || hasFpsChange || hasScaleChange || needsAudioReencode || forcedPreciseTrimReencode
  const useFastSeek = isGifOutput || !needsReencode
  const trimStart = isTrimmed && fps > 0 ? frameToTime(inFrame, fps) : null
  const useCoarsePreseekForReencode =
    trimStart !== null &&
    needsReencode &&
    !useFastSeek &&
    !isGifOutput &&
    trimStart > COARSE_REENCODE_SEEK_LEAD_SECONDS
  const coarseSeekStart = useCoarsePreseekForReencode
    ? Math.max(0, trimStart - COARSE_REENCODE_SEEK_LEAD_SECONDS)
    : null
  const accurateSeekOffset = trimStart === null
    ? null
    : (coarseSeekStart === null ? trimStart : trimStart - coarseSeekStart)

  const args: string[] = []

  // for stream-copy, keep -ss before -i (fast seek).
  // for re-encode, place -ss after -i to avoid keyframe preroll drift.
  if (trimStart !== null && useFastSeek) {
    args.push('-ss', trimStart.toFixed(6))
  } else if (coarseSeekStart !== null) {
    args.push('-ss', coarseSeekStart.toFixed(6))
  }

  args.push('-i', inputName)

  if (accurateSeekOffset !== null && needsReencode && !useFastSeek) {
    args.push('-ss', accurateSeekOffset.toFixed(6))
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
  let filteredVideoW = sourceW
  let filteredVideoH = sourceH

  if (hasCrop) {
    const clamped = clampCropToSource({
      x: Math.round(crop.x),
      y: Math.round(crop.y),
      width: Math.round(crop.width),
      height: Math.round(crop.height),
    }, sourceW, sourceH)

    const normalized = normalizeCropForCodec(clamped, resolvedVideoCodec, sourceW, sourceH)
    vFilters.push(`crop=${normalized.width}:${normalized.height}:${normalized.x}:${normalized.y}`)
    filteredVideoW = normalized.width
    filteredVideoH = normalized.height
  }

  if (!isGifOutput && hasFpsChange) {
    vFilters.push(`fps=${videoProps.fps}`)
  }

  if (hasScaleChange) {
    const normalizedWidth = normalizeRequestedDimension(videoProps.width, resolvedVideoCodec)
    const normalizedHeight = normalizeRequestedDimension(videoProps.height, resolvedVideoCodec)
    const sourceAspect = filteredVideoH > 0 ? filteredVideoW / filteredVideoH : 1

    if (videoProps.keepAspectRatio) {
      if (normalizedWidth !== null && normalizedHeight !== null) {
        vFilters.push(`scale=${normalizedWidth}:${normalizedHeight}:flags=fast_bilinear:force_original_aspect_ratio=decrease`)
      } else if (normalizedWidth !== null) {
        const derivedHeight = normalizeRequestedDimension(Math.round(normalizedWidth / sourceAspect), resolvedVideoCodec)
        vFilters.push(`scale=${normalizedWidth}:${derivedHeight ?? -1}:flags=fast_bilinear`)
      } else if (normalizedHeight !== null) {
        const derivedWidth = normalizeRequestedDimension(Math.round(normalizedHeight * sourceAspect), resolvedVideoCodec)
        vFilters.push(`scale=${derivedWidth ?? -1}:${normalizedHeight}:flags=fast_bilinear`)
      }
    } else if (normalizedWidth !== null && normalizedHeight !== null) {
      // Unlocked mode stretches to exact dimensions, including non-native aspect ratios.
      vFilters.push(`scale=${normalizedWidth}:${normalizedHeight}:flags=fast_bilinear`)
    } else if (normalizedWidth !== null) {
      vFilters.push(`scale=${normalizedWidth}:-1:flags=fast_bilinear`)
    } else if (normalizedHeight !== null) {
      vFilters.push(`scale=-1:${normalizedHeight}:flags=fast_bilinear`)
    }
  }

  if (isGifOutput) {
    // browser/wasm gif encoding is expensive at source resolution and fps.
    // apply sane defaults unless user explicitly set output fps.
    const requestedGifFps = videoProps.fps && videoProps.fps > 0 ? Math.round(videoProps.fps) : 8
    const gifFps = fps > 0 ? Math.min(requestedGifFps, fps) : requestedGifFps
    vFilters.push(`fps=${gifFps}`)
    // keep gif generation fast: cap width and never upscale smaller crops.
    vFilters.push('scale=min(480\\,iw):-1:flags=fast_bilinear')
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
      const effectivePreset = videoProps.fastExport ? 'ultrafast' : (forcedCropReencode ? 'ultrafast' : videoProps.preset)
      args.push('-preset', effectivePreset)
      args.push('-crf', String(videoProps.crf))
      args.push('-pix_fmt', 'yuv420p')
      // multithreaded x264 is much faster; use 1 thread only for fastExport
      const threads = videoProps.fastExport ? '1' : '4'
      args.push('-threads', threads)
      if (videoProps.profile) {
        args.push('-profile:v', videoProps.profile)
      }
    } else if (codec === 'libvpx-vp9') {
      args.push('-c:v', codec)
      args.push('-crf', String(videoProps.crf))
      args.push('-b:v', '0')
      args.push('-pix_fmt', 'yuv420p')
    } else if (codec === 'libvpx') {
      // Prefer faster single-thread WebM encodes in wasm; quality tradeoff is expected.
      args.push('-c:v', codec)
      args.push('-deadline', 'realtime')
      args.push('-cpu-used', '8')
      args.push('-crf', String(resolveWebmBaselineCrf(videoProps.crf)))
      args.push('-b:v', '0')
      args.push('-pix_fmt', 'yuv420p')
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
    if (resolvedAudioCodec === 'libopus' && probe.audioChannels > 2) {
      // The ffmpeg-wasm libopus build can reject some surround layouts
      // (for example 5.1(side)); force a safe downmix for reliable output.
      args.push('-ac', '2')
    }
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
