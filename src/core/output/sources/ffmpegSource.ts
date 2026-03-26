import type { FFmpeg, LogEvent } from '@ffmpeg/ffmpeg'
import { normalizeOutputChannel } from '@/core/output/normalize'
import type { OutputSource } from '@/core/output/types'

export function createFFmpegOutputSource(ffmpeg: FFmpeg): OutputSource {
  return {
    subscribe(subscriber) {
      const onLog = (event: LogEvent) => {
        subscriber({
          channel: normalizeOutputChannel(event.type),
          message: event.message,
          rawType: event.type,
        })
      }

      ffmpeg.on('log', onLog)
      return () => ffmpeg.off('log', onLog)
    },
  }
}
