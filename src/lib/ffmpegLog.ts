/** run ffmpeg commands while collecting and streaming logs. */

import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { bindFFmpegJobOutput } from '@/lib/jobOutput'

/** execute ffmpeg and pipe output lines into a log entry. */
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
