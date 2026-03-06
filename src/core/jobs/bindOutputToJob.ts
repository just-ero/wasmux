import { useLogStore } from '../../stores/logStore'
import type { LogLineType } from '../../stores/logStore'
import type { OutputSource } from '../output/types'

function toLogLineType(channel: string): LogLineType {
  if (channel === 'stderr') return 'stderr'
  if (channel === 'stdout') return 'stdout'
  return 'info'
}

export function appendJobOutput(jobId: string, line: string, type: LogLineType = 'info') {
  useLogStore.getState().appendOutput(jobId, line, type)
}

export function bindOutputToJob(
  source: OutputSource,
  jobId: string,
  onLine?: (line: string, channel: LogLineType) => void,
) {
  return source.subscribe((event) => {
    const type = toLogLineType(event.channel)
    appendJobOutput(jobId, event.message, type)
    onLine?.(event.message, type)
  })
}
