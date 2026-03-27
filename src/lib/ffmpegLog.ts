/** run ffmpeg commands while collecting and streaming logs. */

import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { appendJobOutput } from '@/lib/jobOutput'
import { normalizeOutputChannel } from '@/core/output/normalize'

/** execute ffmpeg and pipe output lines into a log entry. */
export async function execWithLog(
  ffmpeg: FFmpeg,
  args: string[],
  logEntryId: string,
  swallow = false,
  shouldLogLine?: (line: string) => boolean,
): Promise<string[]> {
  const lines: string[] = []
  const onLog = ({ type, message }: { type: string; message: string }) => {
    lines.push(message)

    if (shouldLogLine && !shouldLogLine(message)) return
    const channel = normalizeOutputChannel(type)
    appendJobOutput(logEntryId, message, channel)
  }

  ffmpeg.on('log', onLog)

  try {
    if (swallow) {
      await ffmpeg.exec(args).catch(() => {})
    } else {
      await ffmpeg.exec(args)
    }
  } finally {
    ffmpeg.off('log', onLog)
  }

  return lines
}
