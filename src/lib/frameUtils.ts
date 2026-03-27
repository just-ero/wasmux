/** frame/time conversion and display formatting helpers. */

/** convert frame index to seconds. */
export function frameToTime(frame: number, fps: number): number {
  if (fps <= 0) return 0
  return frame / fps
}

/** convert seconds to nearest frame index. */
export function timeToFrame(seconds: number, fps: number): number {
  if (fps <= 0) return 0
  return Math.round(seconds * fps)
}

/** convert seconds to frame index using floor (monotonic during playback). */
export function timeToFrameFloor(seconds: number, fps: number): number {
  if (fps <= 0) return 0
  return Math.floor(seconds * fps + 1e-9)
}

/** derive total frame count from duration/fps, keeping any fractional tail as a final frame. */
export function totalFramesFromDuration(durationSeconds: number, fps: number): number {
  if (fps <= 0 || durationSeconds <= 0) return 0
  return Math.max(1, Math.ceil(durationSeconds * fps))
}

/** clamp frame to [0, totalFrames - 1]. */
export function clampFrame(frame: number, totalFrames: number): number {
  if (totalFrames <= 0) return 0
  return Math.max(0, Math.min(frame, totalFrames - 1))
}

/** remap a frame index between two fps domains using timeline time as the source of truth. */
export function remapFrameIndex(frame: number, fromFps: number, toFps: number, totalFramesHint?: number): number {
  if (fromFps <= 0 || toFps <= 0) {
    const rounded = Math.max(0, Math.round(frame))
    return totalFramesHint !== undefined ? clampFrame(rounded, totalFramesHint) : rounded
  }
  const mapped = timeToFrame(frameToTime(frame, fromFps), toFps)
  const nonNegative = Math.max(0, mapped)
  return totalFramesHint !== undefined ? clampFrame(nonNegative, totalFramesHint) : nonNegative
}

/** snap a source frame to the nearest frame representable on a target fps grid. */
export function snapFrameToFpsGrid(frame: number, sourceFps: number, gridFps: number, totalSourceFrames: number): number {
  const clamped = clampFrame(Math.round(frame), totalSourceFrames)
  if (sourceFps <= 0 || gridFps <= 0) return clamped

  const seconds = frameToTime(clamped, sourceFps)
  // Snap down to avoid forward jumps when resuming playback from a paused state.
  const gridFrame = Math.max(0, Math.floor(seconds * gridFps + 1e-9))
  const snappedSeconds = frameToTime(gridFrame, gridFps)
  const snappedSourceFrame = timeToFrame(snappedSeconds, sourceFps)
  return clampFrame(snappedSourceFrame, totalSourceFrames)
}

/** format frame as hh:mm:ss:ff. */
export function formatFrame(frame: number, fps: number): string {
  if (fps <= 0) return '00:00:00:00'
  const totalSeconds = frame / fps
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  const f = Math.floor(frame % fps)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`
}

/** format seconds as adaptive hh:mm:ss.fff text. */
export function formatTime(seconds: number, maxSeconds: number): string {
  const wholeSeconds = Math.floor(seconds)
  let ms = Math.round((seconds - wholeSeconds) * 1000)
  let totalSec = wholeSeconds

  if (ms >= 1000) {
    totalSec += 1
    ms = 0
  }

  const msStr = String(ms).padStart(3, '0')
  const s = totalSec % 60
  const m = Math.floor(totalSec / 60) % 60
  const h = Math.floor(totalSec / 3600)

  if (maxSeconds >= 3600) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${msStr}`
  }
  if (maxSeconds >= 600) {
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${msStr}`
  }
  if (maxSeconds >= 60) {
    return `${m}:${String(s).padStart(2, '0')}.${msStr}`
  }
  return `${s}.${msStr}`
}

/** compact frame display. */
export function formatFrameCompact(frame: number): string {
  return String(Math.max(0, Math.round(frame)))
}

/** padded frame display aligned to total frame width. */
export function formatFramePadded(frame: number, totalFrames: number): string {
  const width = String(Math.max(0, totalFrames > 0 ? totalFrames - 1 : 0)).length
  return String(Math.max(0, Math.round(frame))).padStart(width, ' ')
}
