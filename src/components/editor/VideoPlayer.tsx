/** editor video preview rendering and playback toggling. */

import { memo, useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { useFFmpegStore } from '@/stores/ffmpegStore'
import { useLogStore } from '@/stores/logStore'
import type { LogEntry } from '@/stores/logStore'
import { tryPlay } from '@/lib/domUtils'

/* simple animated dots for loading state */
let _frame = 1
const _subs = new Set<() => void>()
let _timer: ReturnType<typeof setInterval> | null = null

function dotSubscribe(cb: () => void) {
  _subs.add(cb)
  if (!_timer) {
    _timer = setInterval(() => {
      _frame = (_frame + 1) % 4
      _subs.forEach((fn) => fn())
    }, 500)
  }
  return () => {
    _subs.delete(cb)
    if (_subs.size === 0 && _timer) {
      clearInterval(_timer)
      _timer = null
    }
  }
}
function dotSnapshot() { return _frame }

export function getLoadingDotsFrameText(frame: number): string {
  const dots = ['\u00A0', '.', '..', '...']
  return dots[((frame % 4) + 4) % 4]
}

function LoadingDots() {
  const f = useSyncExternalStore(dotSubscribe, dotSnapshot)
  return <span className="inline-block min-w-[3ch] text-left">{getLoadingDotsFrameText(f)}</span>
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

function activeChildLabel(entry: LogEntry | undefined): string | null {
  if (!entry) return null
  const runningChild = entry.children.find((child) => child.status === 'running')
  if (runningChild) return runningChild.label
  if (entry.status === 'running') return entry.label
  return null
}

export const VideoPlayer = memo(function VideoPlayer({ videoRef }: Props) {
  const previewUrl = useEditorStore((s) => s.previewUrl)
  const ingestionStatus = useEditorStore((s) => s.ingestionStatus)
  const ffmpegStatus = useFFmpegStore((s) => s.status)
  const ffmpegEngineLog = useLogStore((s) => s.entries.find((entry) => entry.id === 'ffmpeg-engine'))
  const ingestLog = useLogStore((s) => s.entries.find((entry) => entry.id === 'ingest'))
  const probe = useEditorStore((s) => s.probe)
  const videoTrackIndex = useEditorStore((s) => s.videoProps.trackIndex)
  const videoScaleWidth = useEditorStore((s) => s.videoProps.width)
  const videoScaleHeight = useEditorStore((s) => s.videoProps.height)
  const outputFpsOverride = useEditorStore((s) => s.videoProps.fps)
  const keepAspectRatio = useEditorStore((s) => s.videoProps.keepAspectRatio)

  // set video source when previewurl changes
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!previewUrl || videoTrackIndex === null) {
      video.pause()
      video.removeAttribute('src')
      video.load()
      return
    }
    video.src = previewUrl
    video.load()
    return () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [previewUrl, videoRef, videoTrackIndex])

  const showVideo = Boolean(previewUrl && videoTrackIndex !== null)
  const showAudioOnlyState = videoTrackIndex === null
  const shouldShowLoadingSpinner = (ingestionStatus === 'writing' || ingestionStatus === 'probing' || ingestionStatus === 'preview') || (videoTrackIndex !== null && !previewUrl)
  const ffmpegJobLabel = activeChildLabel(ffmpegEngineLog)
  const ingestJobLabel = activeChildLabel(ingestLog)
  const loadingLabel = ffmpegStatus === 'loading'
    ? (ffmpegJobLabel ? `loading ffmpeg: ${ffmpegJobLabel}` : 'loading ffmpeg engine')
    : ingestJobLabel
      ? ingestJobLabel
      : 'preparing preview'
  const audioOnlyReason = probe && probe.videoTracks.length === 0
    ? 'no video track found in source'
    : 'video disabled for this export'

  const sourceWidth = Math.max(1, probe?.width ?? 1)
  const sourceHeight = Math.max(1, probe?.height ?? 1)
  const sourceAspect = sourceHeight > 0 ? sourceWidth / sourceHeight : 1
  const requestedWidth = videoScaleWidth && videoScaleWidth > 0 ? Math.floor(videoScaleWidth) : null
  const requestedHeight = videoScaleHeight && videoScaleHeight > 0 ? Math.floor(videoScaleHeight) : null

  let previewBoxWidth = sourceWidth
  let previewBoxHeight = sourceHeight

  if (requestedWidth !== null || requestedHeight !== null) {
    if (!keepAspectRatio && requestedWidth !== null && requestedHeight !== null) {
      // Unlocked mode renders the exact output shape, including non-native aspect ratios.
      previewBoxWidth = requestedWidth
      previewBoxHeight = requestedHeight
    } else if (requestedWidth !== null && requestedHeight !== null) {
      const fitScale = Math.min(requestedWidth / sourceWidth, requestedHeight / sourceHeight)
      previewBoxWidth = Math.max(1, Math.round(sourceWidth * fitScale))
      previewBoxHeight = Math.max(1, Math.round(sourceHeight * fitScale))
    } else if (requestedWidth !== null) {
      previewBoxWidth = requestedWidth
      previewBoxHeight = Math.max(1, Math.round(requestedWidth / sourceAspect))
    } else if (requestedHeight !== null) {
      previewBoxHeight = requestedHeight
      previewBoxWidth = Math.max(1, Math.round(requestedHeight * sourceAspect))
    }
  }

  const isDownscaled = previewBoxWidth < sourceWidth || previewBoxHeight < sourceHeight
  const hasResOverride = requestedWidth !== null || requestedHeight !== null

  // --- canvas-based pixelated preview for downscale ---
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)

  const drawPixelated = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // ensure offscreen canvas exists at target resolution
    if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas')
    const off = offscreenRef.current
    if (off.width !== previewBoxWidth || off.height !== previewBoxHeight) {
      off.width = previewBoxWidth
      off.height = previewBoxHeight
    }
    const offCtx = off.getContext('2d')
    if (!offCtx) return

    // draw video at target (small) resolution — bilinear downscale
    offCtx.drawImage(video, 0, 0, previewBoxWidth, previewBoxHeight)

    // match canvas display size
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const cw = Math.round(rect.width * dpr)
    const ch = Math.round(rect.height * dpr)
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw
      canvas.height = ch
    }

    // draw small image back up with nearest-neighbor
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, cw, ch)

    // letterbox / pillarbox to match object-contain behavior
    const canvasAspect = cw / ch
    const boxAspect = previewBoxWidth / previewBoxHeight
    let dw: number, dh: number, dx: number, dy: number
    if (boxAspect > canvasAspect) {
      dw = cw
      dh = cw / boxAspect
      dx = 0
      dy = (ch - dh) / 2
    } else {
      dh = ch
      dw = ch * boxAspect
      dx = (cw - dw) / 2
      dy = 0
    }
    ctx.drawImage(off, 0, 0, previewBoxWidth, previewBoxHeight, dx, dy, dw, dh)
  }, [videoRef, previewBoxWidth, previewBoxHeight])

  const previewFps = outputFpsOverride && outputFpsOverride > 0 ? outputFpsOverride : null
  const showPixelCanvas = showVideo && ((isDownscaled && hasResOverride) || previewFps !== null)

  useEffect(() => {
    if (!showPixelCanvas) {
      offscreenRef.current = null
      return
    }
    const video = videoRef.current
    if (!video) return

    let running = true
    let lastDrawTs = 0
    const minFrameMs = previewFps && previewFps > 0 ? 1000 / previewFps : 0

    const loop = (ts: number) => {
      if (!running) return
      if (minFrameMs === 0 || ts - lastDrawTs >= minFrameMs) {
        drawPixelated()
        lastDrawTs = ts
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    // start the loop once video has data
    const start = () => { rafRef.current = requestAnimationFrame(loop) }
    if (video.readyState >= 2) start()
    else video.addEventListener('loadeddata', start, { once: true })

    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
      offscreenRef.current = null
    }
  }, [showPixelCanvas, drawPixelated, videoRef, previewFps])

  return (
    <div
      className="relative flex-1 flex items-center justify-center bg-bg-sunken overflow-hidden min-h-0"
    >
      {showVideo && (
        <video
          ref={videoRef}
          className={`w-full h-full ${(!keepAspectRatio && requestedWidth !== null && requestedHeight !== null) ? 'object-fill' : 'object-contain'}`}
          style={showPixelCanvas ? { visibility: 'hidden', position: 'absolute' } : undefined}
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          preload="auto"
          tabIndex={0}
          aria-label="Video preview. Space to play/pause, comma/period to step frames."
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              const v = videoRef.current
              if (v) {
                if (v.paused) tryPlay(v)
                else v.pause()
              }
            }
          }}
          onClick={() => {
            const v = videoRef.current
            if (v) {
              if (v.paused) tryPlay(v)
              else v.pause()
            }
          }}
        />
      )}

      {showPixelCanvas && (
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ imageRendering: 'pixelated' }}
          onClick={() => {
            const v = videoRef.current
            if (v) {
              if (v.paused) tryPlay(v)
              else v.pause()
            }
          }}
        />
      )}

      {shouldShowLoadingSpinner && (
        <div className="flex flex-col items-center gap-2 text-text-muted select-text cursor-text">
          <div className="text-2xl font-mono"><LoadingDots /></div>
          <span>{loadingLabel}</span>
        </div>
      )}

      {!showVideo && !shouldShowLoadingSpinner && showAudioOnlyState && (
        <div className="text-text-muted select-text cursor-text">{audioOnlyReason}</div>
      )}

      {!showVideo && !shouldShowLoadingSpinner && !showAudioOnlyState && (
        <div className="text-text-muted select-text cursor-text">preview unavailable</div>
      )}

    </div>
  )
})
