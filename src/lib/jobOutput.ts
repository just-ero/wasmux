import type { FFmpeg, LogEvent } from '@ffmpeg/ffmpeg'
import type { LogLineType } from '@/stores/logStore'
import { bindOutputToJob, appendJobOutput } from '@/core/jobs/bindOutputToJob'
import { createFFmpegOutputSource } from '@/core/output'
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
) {
  const source = createFFmpegOutputSource(ffmpeg)
  return bindOutputToJob(source, jobId, (line) => {
    onLine?.({ type: 'stdout', message: line })
  })
}
