import { OUTPUT_FORMATS } from '@/types/editor'
import type { OutputFormat } from '@/types/editor'

const OUTPUT_MIME_BY_EXTENSION: Record<Exclude<OutputFormat, 'source'>, string> = {
  avi: 'video/x-msvideo',
  flac: 'audio/flac',
  flv: 'video/x-flv',
  gif: 'image/gif',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  ogg: 'video/ogg',
  ogv: 'video/ogg',
  wav: 'audio/wav',
  webm: 'video/webm',
}

export function resolveOutputExtension(
  format: OutputFormat,
  sourceFormat: string | undefined,
  sourceFileName?: string,
): Exclude<OutputFormat, 'source'> {
  if (format !== 'source') return format

  const match = /\.([^.]+)$/.exec((sourceFileName ?? '').toLowerCase())
  const sourceFileExt = match && isSupportedOutputExtension(match[1]) ? match[1] : null

  const sourceFormatExt = resolveSourceFormatExtension(sourceFormat)

  // if filename and probe-derived container disagree, trust the probe format.
  // this avoids carrying stale/misleading extensions through source exports.
  if (sourceFileExt && sourceFormatExt && sourceFileExt !== sourceFormatExt) {
    return sourceFormatExt
  }

  if (sourceFileExt) return sourceFileExt
  if (sourceFormatExt) return sourceFormatExt
  return 'mp4'
}

function resolveSourceFormatExtension(sourceFormat: string | undefined): Exclude<OutputFormat, 'source'> | null {
  const normalized = sourceFormat?.toLowerCase() ?? ''
  if (!normalized) return null

  if (normalized.includes('matroska')) return 'mkv'
  if (normalized.includes('webm')) return 'webm'
  if (normalized.includes('avi')) return 'avi'
  if (normalized.includes('mp4') || normalized.includes('isom')) return 'mp4'
  if (normalized.includes('mov') || normalized.includes('quicktime')) return 'mov'
  if (normalized.includes('ogv')) return 'ogv'
  if (normalized.includes('ogg')) return 'ogg'
  if (normalized.includes('flv')) return 'flv'
  if (normalized.includes('flac')) return 'flac'
  if (normalized.includes('wav')) return 'wav'
  if (normalized.includes('mp3')) return 'mp3'
  if (normalized.includes('gif')) return 'gif'
  return null
}

export function isSupportedOutputExtension(value: string): value is Exclude<OutputFormat, 'source'> {
  return (OUTPUT_FORMATS as readonly string[]).includes(value)
}

export function getOutputMimeType(extension: Exclude<OutputFormat, 'source'>): string {
  return OUTPUT_MIME_BY_EXTENSION[extension]
}
