/** editor video preview rendering and playback toggling. */

import { memo, useEffect, useSyncExternalStore } from 'react'
import { useEditorStore } from '@/stores/editorStore'

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

export const VideoPlayer = memo(function VideoPlayer({ videoRef }: Props) {
  const previewUrl = useEditorStore((s) => s.previewUrl)
  const ingestionStatus = useEditorStore((s) => s.ingestionStatus)
  const probe = useEditorStore((s) => s.probe)
  const videoTrackIndex = useEditorStore((s) => s.videoProps.trackIndex)

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
  const audioOnlyReason = probe && probe.videoTracks.length === 0
    ? 'no video track found in source'
    : 'video disabled for this export'

  return (
    <div
      className="relative flex-1 flex items-center justify-center bg-bg-sunken overflow-hidden min-h-0"
    >
      {showVideo && (
        <video
          ref={videoRef}
          className="max-w-full max-h-full object-contain"
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          preload="auto"
          tabIndex={0}
          aria-label="Video preview. Space to play/pause, comma/period to step frames."
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault()
              const v = videoRef.current
              if (v) {
                if (v.paused) v.play()
                else v.pause()
              }
            }
          }}
          onClick={() => {
            const v = videoRef.current
            if (v) {
              if (v.paused) v.play()
              else v.pause()
            }
          }}
        />
      )}

      {shouldShowLoadingSpinner && (
        <div className="flex flex-col items-center gap-2 text-text-muted select-text cursor-text">
          <div className="text-2xl font-mono"><LoadingDots /></div>
          <span>preparing preview</span>
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
