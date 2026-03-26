/** parse ffmpeg -i stderr into a ProbeResult. */

import type { FFmpeg } from '@ffmpeg/ffmpeg'
import type { ProbeResult, TrackInfo } from '../types/editor'
import { execWithLog } from './ffmpegLog'

/** probe a wasm-fs file and return parsed metadata. */
export async function probeFile(
  ffmpeg: FFmpeg,
  filename: string,
  logEntryId?: string,
): Promise<ProbeResult> {
  let lines: string[]

  if (logEntryId) {
    // pipe output to logstore and collect lines for parsing.
    lines = await execWithLog(ffmpeg, ['-i', filename], logEntryId, true)
  } else {
    // no log capture - just collect internally.
    lines = []
    const onLog = ({ message }: { type: string; message: string }) => { lines.push(message) }
    ffmpeg.on('log', onLog)
    try { await ffmpeg.exec(['-i', filename]).catch(() => {}) }
    finally { ffmpeg.off('log', onLog) }
  }

  return parseProbeOutput(lines)
}

/* regex patterns */
const reDuration = /Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/
// matches common ffmpeg stream formats, including optional stream-id brackets:
//   stream #0:0(und): video: ...
//   stream #0:0[0x1](und): video: ...
//   stream #0:1[0x2]: audio: ...
const reStream   = /Stream\s+#\d+:(\d+)(?:\[[^\]]+\])?(?:\(([^)]*)\))?:\s+(Video|Audio|Subtitle):\s+(.+)/
const reRes      = /(\d{2,5})x(\d{2,5})/
const reFps      = /([\d.]+)\s*(?:fps|tbr)/
const reBitrate  = /([\d.]+)\s*k(?:b|bit)s?\/s/i
const reContainerBitrate = /Duration:[^\n]*bitrate:\s*([\d.]+)\s*k(?:b|bit)s?\/s/i
const reSampleRate = /(\d+)\s*Hz/
const reChannels   = /\b(mono|stereo|5\.1|7\.1|((?:\d+\.\d+)|(?:\d+\s*channels?)))\b/i

function parseDurationSeconds(hours: string, minutes: string, seconds: string, fraction: string): number {
  const fractionScale = Math.pow(10, fraction.length)
  const fractionalSeconds = fractionScale > 0 ? parseInt(fraction, 10) / fractionScale : 0
  return parseInt(hours, 10) * 3600 + parseInt(minutes, 10) * 60 + parseInt(seconds, 10) + fractionalSeconds
}

/** parse collected log lines into a ProbeResult. */
export function parseProbeOutput(lines: string[]): ProbeResult {
  const result: ProbeResult = {
    duration: 0,
    width: 0,
    height: 0,
    fps: 0,
    videoCodec: '',
    audioCodec: '',
    containerBitrate: 0,
    videoBitrate: 0,
    audioBitrate: 0,
    audioSampleRate: 0,
    audioChannels: 0,
    videoTracks: [],
    audioTracks: [],
    subtitleTracks: [],
    format: '',
  }

  const text = lines.join('\n')

  // duration
  const durMatch = reDuration.exec(text)
  if (durMatch) {
    const [, h, m, s, cs] = durMatch
    result.duration = parseDurationSeconds(h, m, s, cs)
  }

  // format - "input #0, mov,mp4,m4a,3gp,3g2,mj2, from ..."
  // capture the full comma-delimited format list, not just the first token.
  const fmtMatch = /Input\s+#\d+,\s*(.+?),\s*from\s+/.exec(text)
  if (fmtMatch) {
    result.format = fmtMatch[1].trim()
  }

  const containerBitrateMatch = reContainerBitrate.exec(text)
  if (containerBitrateMatch) {
    result.containerBitrate = parseFloat(containerBitrateMatch[1])
  }

  // streams
  const streamRegex = new RegExp(reStream.source, 'g')
  let sm: RegExpExecArray | null
  while ((sm = streamRegex.exec(text)) !== null) {
    const [, indexStr, lang, kind, detail] = sm
    const index = parseInt(indexStr)
    const codecMatch = detail.match(/^(\S+)/)
    const codec = codecMatch ? codecMatch[1].replace(/,$/, '') : ''

    const langLabel = lang ? ` (${lang})` : ''

    if (kind === 'Video') {
      const track: TrackInfo = { index, codec, label: `${codec}${langLabel}` }
      result.videoTracks.push(track)

      // use first video track for top-level fields.
      if (result.videoTracks.length === 1) {
        result.videoCodec = codec
        const resM = reRes.exec(detail)
        if (resM) {
          result.width = parseInt(resM[1])
          result.height = parseInt(resM[2])
        }
        const fpsM = reFps.exec(detail)
        if (fpsM) result.fps = parseFloat(fpsM[1])
        const brM = reBitrate.exec(detail)
        if (brM) result.videoBitrate = parseFloat(brM[1])
      }
    } else if (kind === 'Audio') {
      const track: TrackInfo = { index, codec, label: `${codec}${langLabel}` }
      result.audioTracks.push(track)

      if (result.audioTracks.length === 1) {
        result.audioCodec = codec
        const srM = reSampleRate.exec(detail)
        if (srM) result.audioSampleRate = parseInt(srM[1])
        const chM = reChannels.exec(detail)
        if (chM) {
          if (chM[1] === 'mono') result.audioChannels = 1
          else if (chM[1] === 'stereo') result.audioChannels = 2
          else if (chM[1] === '5.1') result.audioChannels = 6
          else if (chM[1] === '7.1') result.audioChannels = 8
          else if (chM[2]) {
            const parsed = Math.round(parseFloat(chM[2].replace(/\s*channels?/i, '')))
            if (Number.isFinite(parsed) && parsed > 0) result.audioChannels = parsed
          }
        }
        const brM = reBitrate.exec(detail)
        if (brM) result.audioBitrate = parseFloat(brM[1])
      }
    } else if (kind === 'Subtitle') {
      result.subtitleTracks.push({ index, codec, label: `${codec}${langLabel}` })
    }
  }

  // validate parsed numbers - reject nan / infinity.
  const num = (v: number) => Number.isFinite(v) ? v : 0
  result.duration = num(result.duration)
  result.width = num(result.width)
  result.height = num(result.height)
  result.fps = num(result.fps)
  result.containerBitrate = num(result.containerBitrate)
  result.videoBitrate = num(result.videoBitrate)
  result.audioBitrate = num(result.audioBitrate)
  result.audioSampleRate = num(result.audioSampleRate)
  result.audioChannels = num(result.audioChannels)

  return result
}
