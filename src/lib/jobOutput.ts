import type { FFmpeg, LogEvent } from '@ffmpeg/ffmpeg'
import type { LogLineType } from '@/stores/logStore'
import { bindOutputToJob, appendJobOutput } from '@/core/jobs/bindOutputToJob'
import { normalizeOutputChannel } from '@/core/output/normalize'
import type { OutputSource } from '@/core/output'

export { appendJobOutput }

export function bindJobOutputSource(
  source: OutputSource,
  jobId: string,
  onLine?: (line: string, channel: LogLineType) => void,
) {
  return bindOutputToJob(source, jobId, onLine)
}

export function bindFFmpegJobOutput(
  ffmpeg: FFmpeg,
  jobId: string,
  onLine?: (event: LogEvent) => void,
  shouldLogLine?: (line: string) => boolean,
) {
  const onLog = (event: LogEvent) => {
    onLine?.(event)

    if (shouldLogLine && !shouldLogLine(event.message)) return
    const channel = normalizeOutputChannel(event.type)
    appendJobOutput(jobId, event.message, channel)
  }

  ffmpeg.on('log', onLog)
  return () => ffmpeg.off('log', onLog)
}
