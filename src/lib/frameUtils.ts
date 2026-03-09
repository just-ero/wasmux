/**
 * frameutils.ts - frame ↔ time conversion and display formatting.
 *
 * the editor uses a frame-based model: all positions and selections
 * are stored as integer frame numbers. this module converts between
 * frame numbers and seconds, and formats frames for display.
 */

/** convert a frame number to a time in seconds. */
export function frameToTime(frame: number, fps: number): number {
  if (fps <= 0) return 0
  return frame / fps
}

/** convert a time in seconds to the nearest frame number. */
export function timeToFrame(seconds: number, fps: number): number {
  if (fps <= 0) return 0
  return Math.round(seconds * fps)
}

/** clamp a frame number to [0, totalframes - 1] (or 0 if totalframes ≤ 0). */
export function clampFrame(frame: number, totalFrames: number): number {
  if (totalFrames <= 0) return 0
  return Math.max(0, Math.min(frame, totalFrames - 1))
}

/**
 * format a frame number for display as hh:mm:ss:ff.
 * the ff portion is the frame offset within the current second.
 */
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

/**
 * format seconds as adaptive hh:mm:ss.fff.
 * only shows as many leading components as needed for `maxseconds`.
 *   - maxseconds >= 3600  → hh:mm:ss.fff
 *   - maxseconds >= 600   → mm:ss.fff
 *   - maxseconds >= 60    → m:ss.fff
 *   - otherwise           → s.fff  (no leading zero)
 */
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
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${msStr}`
  }
  if (maxSeconds >= 600) {
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${msStr}`
  }
  if (maxSeconds >= 60) {
    return `${m}:${String(s).padStart(2, '0')}.${msStr}`
  }
  return `${s}.${msStr}`
}

/**
 * compact frame display: just the integer frame number.
 * handles fps <= 0 gracefully.
 */
export function formatFrameCompact(frame: number): string {
  return String(Math.max(0, Math.round(frame)))
}

/**
 * padded frame display: right-aligned with spaces to match totalframes width.
 * e.g. totalframes=35180 → "    0", "  100", "35179"
 */
export function formatFramePadded(frame: number, totalFrames: number): string {
  const width = String(Math.max(0, totalFrames > 0 ? totalFrames - 1 : 0)).length
  return String(Math.max(0, Math.round(frame))).padStart(width, ' ')
}
