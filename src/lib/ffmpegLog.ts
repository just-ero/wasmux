/**
 * ffmpeglog.ts - run ffmpeg commands with automatic log capture.
 *
 * wraps ffmpeg.exec() so that every stdout/stderr line is:
 *   1. collected into a string[] for the caller to parse.
 *   2. piped into a logstore entry's outputlines for display.
 *
 * this way, probe.ts and keyframes.ts get their lines for parsing
 * while the user sees every raw ffmpeg line in the log panel.
 */

import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { bindFFmpegJobOutput } from './jobOutput'

/**
 * execute an ffmpeg command while piping log output to a logstore entry.
 *
 * @param ffmpeg     the ffmpeg instance.
 * @param args       cli arguments (e.g. ['-i', 'input.mp4']).
 * @param logentryid the id of the logstore entry to append output to.
 * @param swallow    if true, catch exec rejection (needed for `-i` probe).
 * @returns          all captured log lines (for further parsing).
 */
export async function execWithLog(
  ffmpeg: FFmpeg,
  args: string[],
  logEntryId: string,
  swallow = false,
): Promise<string[]> {
  const lines: string[] = []
  const detach = bindFFmpegJobOutput(ffmpeg, logEntryId, ({ message }) => {
    lines.push(message)
  })

  try {
    if (swallow) {
      await ffmpeg.exec(args).catch(() => {})
    } else {
      await ffmpeg.exec(args)
    }
  } finally {
    detach()
  }

  return lines
}
