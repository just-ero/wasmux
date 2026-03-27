import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Icons from '@/components/shared/Icons'
import { DangerXButton } from '@/components/shared/DangerXButton'
import { LinkedDimensionInput } from '@/components/shared/LinkedDimensionInput'
import { SegmentedTimeInput } from '@/components/shared/SegmentedTimeInput'
import { TrimRibbonVisual } from '@/components/editor/TrimRibbonVisual'
import { useEditorStore } from '@/stores/editorStore'
import { clampFrame, formatFrameCompact, formatFramePadded, formatTime, frameToTime, remapFrameIndex, timeToFrame, totalFramesFromDuration } from '@/lib/frameUtils'
import { lockFocusedInputWheelScroll } from '@/lib/domUtils'
import type { AudioCodec, VideoCodec } from '@/types/editor'

const VIDEO_CODECS: VideoCodec[] = ['copy', 'libx264', 'libvpx-vp9', 'mpeg4', 'libtheora']
const AUDIO_CODECS: AudioCodec[] = ['copy', 'aac', 'libmp3lame', 'libvorbis', 'libopus', 'flac', 'ac3']

function parseIntOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

function formatFpsPlaceholder(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function formatFpsValue(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function GroupTitle({ title }: { title: string }) {
  return (
    <div className="pt-1 text-[12px] font-semibold text-text/90">
      <span className="select-text cursor-text">{title}</span>
      <div className="mt-0.5 h-px bg-border/60" />
    </div>
  )
}

function SettingResetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <DangerXButton label={label} onClick={onClick} />
}

function PropertyRow({ label, labelWidth, children }: { label: string; labelWidth: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-7 items-center" style={{ gap: 'calc(var(--wasmux-edge-space) * 1.5)', paddingBlock: 'calc(var(--wasmux-edge-space) / 2)' }}>
      <span className="shrink-0 text-[12px] text-text-muted select-text cursor-text" style={{ width: labelWidth }}>{label}</span>
      <div className="min-w-0 flex flex-1 flex-wrap items-center" style={{ gap: 'var(--wasmux-edge-space)' }}>{children}</div>
    </div>
  )
}

interface SummaryItem {
  id: string
  text: string
  title: string
  showInfoIcon?: boolean
}

function InlineSummary({ items }: { items: SummaryItem[] }) {
  return (
    <div className="flex flex-wrap items-center text-[12px] text-text-muted/80 select-text cursor-text" style={{ rowGap: 'calc(var(--wasmux-edge-space) / 2)' }}>
      {items.map((item, index) => (
        <div key={item.id} className="inline-flex items-center" style={{ gap: 'calc(var(--wasmux-edge-space) / 2)' }}>
          {index > 0 && <span className="text-text-muted/70" style={{ paddingInline: 'calc(var(--wasmux-edge-space) / 2)' }}>/</span>}
          <span className="inline-flex items-center" style={{ gap: 'calc(var(--wasmux-edge-space) / 2)' }} title={item.title}>
            <span>{item.text}</span>
            {item.showInfoIcon && <Icons.UiInfo className="cursor-default" />}
          </span>
        </div>
      ))}
    </div>
  )
}

interface BitrateDisplay {
  text: string
  title: string
  showInfoIcon: boolean
}

function formatBitrateValue(kind: 'video' | 'audio', bitrate: number, containerBitrate: number, trackCount: number) {
  if (bitrate > 0) return { text: `${bitrate} kbps`, title: `${kind} stream bitrate reported by the source file.`, showInfoIcon: false }
  if (trackCount === 0) {
    return { text: `missing: no ${kind} track`, title: `No ${kind} track is currently selected.`, showInfoIcon: false }
  }
  if (containerBitrate > 0) {
    return {
      text: `${containerBitrate} kbps`,
      title: `Only container bitrate was reported. This is the whole-file bitrate, not a ${kind}-stream bitrate.`,
      showInfoIcon: true,
    }
  }

  return {
    text: 'missing',
    title: `${kind} bitrate was not reported by the source metadata.`,
    showInfoIcon: false,
  }
}

function PropertiesPanelImpl() {
  const activeTab = useEditorStore((s) => s.activeTab)
  const probe = useEditorStore((s) => s.probe)
  const crop = useEditorStore((s) => s.crop)
  const setCrop = useEditorStore((s) => s.setCrop)
  const selections = useEditorStore((s) => s.selections)
  const setInPoint = useEditorStore((s) => s.setInPoint)
  const setOutPoint = useEditorStore((s) => s.setOutPoint)
  const totalFrames = useEditorStore((s) => s.totalFrames)
  const showFrames = useEditorStore((s) => s.showFrames)
  const videoProps = useEditorStore((s) => s.videoProps)
  const setVideoProps = useEditorStore((s) => s.setVideoProps)
  const audioProps = useEditorStore((s) => s.audioProps)
  const setAudioProps = useEditorStore((s) => s.setAudioProps)
  const fpsInputRef = useRef<HTMLInputElement>(null)
  const cropXRef = useRef<HTMLInputElement>(null)
  const cropYRef = useRef<HTMLInputElement>(null)
  const cropWRef = useRef<HTMLInputElement>(null)
  const cropHRef = useRef<HTMLInputElement>(null)
  const trimInRef = useRef<HTMLInputElement>(null)
  const trimOutRef = useRef<HTMLInputElement>(null)

  const fps = probe?.fps ?? 0
  const duration = probe?.duration ?? 0
  const sel = selections[0]
  const start = sel?.start ?? 0
  const end = sel?.end ?? Math.max(0, totalFrames - 1)
  const isTrimmed = start > 0 || end < Math.max(0, totalFrames - 1)
  const displayFps = videoProps.fps && videoProps.fps > 0 ? videoProps.fps : fps
  const displayTotalFrames = displayFps > 0 && duration > 0
    ? totalFramesFromDuration(duration, displayFps)
    : totalFrames
  const startDisplay = remapFrameIndex(start, fps, displayFps, displayTotalFrames)
  const endDisplay = remapFrameIndex(end, fps, displayFps, displayTotalFrames)
  const startDisplayOne = displayTotalFrames > 0 ? startDisplay + 1 : 0
  const endDisplayOne = displayTotalFrames > 0 ? endDisplay + 1 : 0
  const effectiveCrop = crop ?? { x: 0, y: 0, width: probe?.width ?? 0, height: probe?.height ?? 0 }
  const hasVideoTrackSelected = videoProps.trackIndex !== null
  const hasResolutionOverride = videoProps.width !== null || videoProps.height !== null
  const inText = showFrames ? formatFrameCompact(startDisplayOne) : formatTime(fps > 0 ? frameToTime(start, fps) : 0, duration)
  const outText = showFrames ? formatFrameCompact(endDisplayOne) : formatTime(fps > 0 ? frameToTime(end, fps) : 0, duration)
  const trimInPlaceholder = showFrames ? '1' : formatTime(0, duration)
  const trimOutPlaceholder = showFrames ? String(Math.max(1, displayTotalFrames)) : formatTime(duration, duration)
  const trimDisplayInText = showFrames ? formatFramePadded(startDisplayOne, displayTotalFrames) : inText
  const trimDisplayOutText = showFrames ? formatFramePadded(endDisplayOne, displayTotalFrames) : outText
  const trimFieldWidth = `${Math.max(16, Math.max(trimDisplayInText.length, trimDisplayOutText.length) + 4)}ch`
  const trimMockInPct = 0
  const trimMockOutPct = 100
  const trimMockKeyframePcts: number[] = []
  const sourceScaleWidth = probe?.width ?? 1
  const sourceScaleHeight = probe?.height ?? 1
  const sourceScaleAspect = sourceScaleHeight > 0 ? sourceScaleWidth / sourceScaleHeight : 1
  const effectiveOutputW = videoProps.width ?? (videoProps.height ? Math.max(1, Math.round(videoProps.height * sourceScaleAspect)) : sourceScaleWidth)
  const effectiveOutputH = videoProps.height ?? (videoProps.width ? Math.max(1, Math.round(videoProps.width / sourceScaleAspect)) : sourceScaleHeight)
  const cropStepX = Math.max(1, sourceScaleWidth / Math.max(1, effectiveOutputW))
  const cropStepY = Math.max(1, sourceScaleHeight / Math.max(1, effectiveOutputH))
  const sourceWidthPlaceholder = String(Math.max(1, Math.round(probe?.width ?? 1)))
  const sourceHeightPlaceholder = String(Math.max(1, Math.round(probe?.height ?? 1)))
  const defaultVideoTrackIndex = probe?.videoTracks[0]?.index ?? null
  const defaultAudioTrackIndex = probe?.audioTracks[0]?.index ?? null
  const cropWidthPlaceholder = String(Math.max(1, effectiveOutputW))
  const cropHeightPlaceholder = String(Math.max(1, effectiveOutputH))
  const cropUi = useMemo(() => ({
    x: Math.round(effectiveCrop.x / cropStepX),
    y: Math.round(effectiveCrop.y / cropStepY),
    width: Math.max(1, Math.round(effectiveCrop.width / cropStepX)),
    height: Math.max(1, Math.round(effectiveCrop.height / cropStepY)),
  }), [effectiveCrop.x, effectiveCrop.y, effectiveCrop.width, effectiveCrop.height, cropStepX, cropStepY])

  // scale factor shown next to resolution when aspect-locked
  const resScaleFactor = useMemo(() => {
    if (!hasResolutionOverride || !videoProps.keepAspectRatio) return null
    const outW = videoProps.width ?? sourceScaleWidth
    const outH = videoProps.height ?? sourceScaleHeight
    const sx = outW / sourceScaleWidth
    const sy = outH / sourceScaleHeight
    const s = Math.min(sx, sy)
    return s
  }, [hasResolutionOverride, videoProps.keepAspectRatio, videoProps.width, videoProps.height, sourceScaleWidth, sourceScaleHeight])

  const [trimInValue, setTrimInValue] = useState(inText)
  const [trimOutValue, setTrimOutValue] = useState(outText)

  useEffect(() => {
    setTrimInValue(inText)
  }, [inText])

  useEffect(() => {
    setTrimOutValue(outText)
  }, [outText])

  const videoBitrate: BitrateDisplay = useMemo(
    () => formatBitrateValue('video', probe?.videoBitrate ?? 0, probe?.containerBitrate ?? 0, probe?.videoTracks.length ?? 0),
    [probe],
  )

  const videoSummary = useMemo(() => {
    if (!probe) return []
    return [
      {
        id: 'bitrate',
        text: `bitrate ${videoBitrate.text}`,
        title: videoBitrate.title,
        showInfoIcon: videoBitrate.showInfoIcon,
      },
    ] satisfies SummaryItem[]
  }, [probe, videoBitrate.showInfoIcon, videoBitrate.text, videoBitrate.title])

  useEffect(() => {
    if (!fpsInputRef.current) return
    return lockFocusedInputWheelScroll(fpsInputRef.current)
  }, [])

  useEffect(() => {
    const refs = [cropXRef, cropYRef, cropWRef, cropHRef, trimInRef, trimOutRef]
    const cleanups = refs
      .map((r) => r.current)
      .filter((el): el is HTMLInputElement => el !== null)
      .map((el) => lockFocusedInputWheelScroll(el))
    return () => {
      cleanups.forEach((fn) => fn())
    }
  }, [])

  const audioSummary = useMemo(() => {
    if (!probe) return []
    return [
      {
        id: 'sample-rate',
        text: `sample rate ${probe.audioSampleRate ? `${probe.audioSampleRate} hz` : 'missing'}`,
        title: 'Source audio sample rate reported by the file.',
      },
      {
        id: 'channels',
        text: `channels ${probe.audioChannels ? `${probe.audioChannels}` : 'missing'}`,
        title: 'Source audio channel count reported by the file.',
      },
    ] satisfies SummaryItem[]
  }, [probe])

  const parseTrimValue = useCallback((text: string): number | null => {
    const trimmed = text.trim()
    if (!trimmed) return null
    if (showFrames && /^\d+$/.test(trimmed)) {
      const parsed = parseInt(trimmed, 10)
      const displayFrame = clampFrame(parsed - 1, displayTotalFrames)
      return remapFrameIndex(displayFrame, displayFps, fps, totalFrames)
    }
    const parts = trimmed.split(':')
    let secs = 0
    if (parts.length === 1) secs = parseFloat(parts[0])
    else if (parts.length === 2) secs = parseInt(parts[0], 10) * 60 + parseFloat(parts[1])
    else if (parts.length === 3) secs = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2])
    else return null
    if (Number.isNaN(secs) || !Number.isFinite(secs) || secs < 0) return null
    return clampFrame(fps > 0 ? timeToFrame(secs, fps) : 0, totalFrames)
  }, [showFrames, totalFrames, displayTotalFrames, displayFps, fps])

  const setCropField = useCallback((field: 'x' | 'y' | 'width' | 'height', raw: string) => {
    const next = parseIntOrNull(raw)
    if (next === null) return
    const nextUiCrop = {
      x: cropUi.x,
      y: cropUi.y,
      width: cropUi.width,
      height: cropUi.height,
      [field]: Math.max(0, next),
    }
    setCrop({
      x: Math.max(0, Math.round(nextUiCrop.x * cropStepX)),
      y: Math.max(0, Math.round(nextUiCrop.y * cropStepY)),
      width: Math.max(1, Math.round(nextUiCrop.width * cropStepX)),
      height: Math.max(1, Math.round(nextUiCrop.height * cropStepY)),
    })
  }, [cropUi.x, cropUi.y, cropUi.width, cropUi.height, cropStepX, cropStepY, setCrop])

  const sourceFpsMax = probe?.fps && probe.fps > 0 ? probe.fps : 60
  const sourceFpsPlaceholder = formatFpsPlaceholder(sourceFpsMax)
  const fpsOverrideValue = videoProps.fps === null ? '' : formatFpsValue(Math.max(1, Math.min(sourceFpsMax, videoProps.fps)))
  const handleFpsOverrideChange = useCallback((raw: string) => {
    if (raw.trim() === '') {
      setVideoProps({ fps: null })
      return
    }
    const parsed = Number.parseFloat(raw)
    if (!Number.isFinite(parsed)) return
    setVideoProps({ fps: Math.max(1, Math.min(sourceFpsMax, parsed)) })
  }, [sourceFpsMax, setVideoProps])

  const handleFpsWheel = useCallback((e: React.WheelEvent<HTMLInputElement>) => {
    if (document.activeElement !== e.currentTarget) return
    e.stopPropagation()
    const up = e.deltaY < 0
    const current = videoProps.fps
    const sourceFloor = Math.max(1, Math.floor(sourceFpsMax))

    let next: number
    if (current === null) {
      next = up ? sourceFpsMax : sourceFloor
    } else {
      const clamped = Math.max(1, Math.min(sourceFpsMax, current))
      if (up) {
        if (clamped >= sourceFpsMax - 1e-9) next = sourceFpsMax
        else next = Math.min(sourceFpsMax, Math.ceil(clamped + 1e-9))
      } else if (Math.abs(clamped - Math.floor(clamped)) > 1e-9) {
        next = Math.max(1, Math.floor(clamped))
      } else {
        next = Math.max(1, Math.floor(clamped) - 1)
      }
    }

    setVideoProps({ fps: next })
  }, [setVideoProps, sourceFpsMax, videoProps.fps])

  const handleCropWheel = useCallback((
    e: React.WheelEvent<HTMLInputElement>,
    field: 'x' | 'y' | 'width' | 'height',
    current: number,
    min: number,
  ) => {
    if (document.activeElement !== e.currentTarget) return
    e.stopPropagation()
    const up = e.deltaY < 0
    const next = Math.max(min, current + (up ? 1 : -1))
    setCropField(field, String(next))
  }, [setCropField])

  const handleTrimWheel = useCallback((e: React.WheelEvent<HTMLInputElement>, kind: 'in' | 'out') => {
    if (!showFrames) return
    if (document.activeElement !== e.currentTarget) return
    e.stopPropagation()
    const up = e.deltaY < 0
    const delta = up ? 1 : -1
    if (kind === 'in') {
      const nextDisplayOne = clampFrame(startDisplayOne + delta, displayTotalFrames + 1)
      const nextDisplay = clampFrame(nextDisplayOne - 1, displayTotalFrames)
      const nextSource = remapFrameIndex(nextDisplay, displayFps, fps, totalFrames)
      setInPoint(nextSource)
    } else {
      const nextDisplayOne = clampFrame(endDisplayOne + delta, displayTotalFrames + 1)
      const nextDisplay = clampFrame(nextDisplayOne - 1, displayTotalFrames)
      const nextSource = remapFrameIndex(nextDisplay, displayFps, fps, totalFrames)
      setOutPoint(nextSource)
    }
  }, [showFrames, startDisplayOne, endDisplayOne, displayTotalFrames, displayFps, fps, totalFrames, setInPoint, setOutPoint])

  const handleResWidthChange = useCallback((w: number | null, linkedH: number | null) => {
    if (linkedH !== undefined) {
      setVideoProps({ width: w, height: linkedH })
    } else {
      setVideoProps({ width: w })
    }
  }, [setVideoProps])

  const handleResHeightChange = useCallback((h: number | null, linkedW: number | null) => {
    if (linkedW !== undefined) {
      setVideoProps({ width: linkedW, height: h })
    } else {
      setVideoProps({ height: h })
    }
  }, [setVideoProps])

  const handleResLinkedChange = useCallback((linked: boolean) => {
    setVideoProps({ keepAspectRatio: linked })
  }, [setVideoProps])

  const commitTrimIn = useCallback(() => {
    const frame = parseTrimValue(trimInValue)
    if (frame !== null) setInPoint(clampFrame(frame, totalFrames))
    setTrimInValue(inText)
  }, [inText, parseTrimValue, setInPoint, totalFrames, trimInValue])

  const commitTrimOut = useCallback(() => {
    const frame = parseTrimValue(trimOutValue)
    if (frame !== null) setOutPoint(clampFrame(frame, totalFrames))
    setTrimOutValue(outText)
  }, [outText, parseTrimValue, setOutPoint, totalFrames, trimOutValue])

  const trimInFieldValue = isTrimmed ? trimInValue : ''
  const trimOutFieldValue = isTrimmed ? trimOutValue : ''

  const commitTrimInSeconds = useCallback((seconds: number) => {
    const frame = clampFrame(fps > 0 ? timeToFrame(seconds, fps) : 0, totalFrames)
    setInPoint(frame)
  }, [fps, setInPoint, totalFrames])

  const commitTrimOutSeconds = useCallback((seconds: number) => {
    const frame = clampFrame(fps > 0 ? timeToFrame(seconds, fps) : 0, totalFrames)
    setOutPoint(frame)
  }, [fps, setOutPoint, totalFrames])

  const resetTrim = useCallback(() => {
    const maxFrame = Math.max(0, totalFrames - 1)
    setInPoint(0)
    setOutPoint(maxFrame)
    if (showFrames) {
      setTrimInValue('1')
      setTrimOutValue(String(Math.max(1, displayTotalFrames)))
    } else {
      setTrimInValue(formatTime(0, duration))
      setTrimOutValue(formatTime(duration, duration))
    }
  }, [totalFrames, setInPoint, setOutPoint, showFrames, displayTotalFrames, duration])

  const labelWidth = useMemo(() => {
    const labels = activeTab === 'audio'
      ? ['codec', 'audio track']
      : ['crop', 'trim', 'codec', 'video track']
    return `${Math.max(...labels.map((label) => label.length)) + 1}ch`
  }, [activeTab])

  if (!probe) return null

  return (
    <div className="h-full overflow-y-auto">
      {activeTab === 'video' && (
        <div className="control-row flex flex-col" style={{ gap: 'calc(var(--wasmux-edge-space) / 2)' }}>
          <InlineSummary items={videoSummary} />

          <GroupTitle title="crop + trim" />
          {hasVideoTrackSelected && (
            <PropertyRow label="crop" labelWidth={labelWidth}>
              <span className="text-[12px] text-text-muted select-text cursor-text">x</span>
              <input ref={cropXRef} aria-label="Crop X" className="control-field control-field-number w-20 tabular-nums" type="text" inputMode="numeric" pattern="[0-9]*" value={crop ? cropUi.x : ''} placeholder="0" onChange={(e) => setCropField('x', e.target.value)} onWheel={(e) => handleCropWheel(e, 'x', cropUi.x, 0)} />
              <span className="text-[12px] text-text-muted select-text cursor-text">y</span>
              <input ref={cropYRef} aria-label="Crop Y" className="control-field control-field-number w-20 tabular-nums" type="text" inputMode="numeric" pattern="[0-9]*" value={crop ? cropUi.y : ''} placeholder="0" onChange={(e) => setCropField('y', e.target.value)} onWheel={(e) => handleCropWheel(e, 'y', cropUi.y, 0)} />
              <span className="text-[12px] text-text-muted select-text cursor-text">w</span>
              <input ref={cropWRef} aria-label="Crop width" className="control-field control-field-number w-20 tabular-nums" type="text" inputMode="numeric" pattern="[0-9]*" value={crop ? cropUi.width : ''} placeholder={cropWidthPlaceholder} onChange={(e) => setCropField('width', e.target.value)} onWheel={(e) => handleCropWheel(e, 'width', cropUi.width, 1)} />
              <span className="text-[12px] text-text-muted select-text cursor-text">h</span>
              <input ref={cropHRef} aria-label="Crop height" className="control-field control-field-number w-20 tabular-nums" type="text" inputMode="numeric" pattern="[0-9]*" value={crop ? cropUi.height : ''} placeholder={cropHeightPlaceholder} onChange={(e) => setCropField('height', e.target.value)} onWheel={(e) => handleCropWheel(e, 'height', cropUi.height, 1)} />
              {crop && (
                <SettingResetButton label="Reset crop (Esc)" onClick={() => setCrop(null)} />
              )}
            </PropertyRow>
          )}
          <PropertyRow label="trim" labelWidth={labelWidth}>
            <span className="shrink-0 text-text-muted select-text cursor-text">[</span>
            {showFrames ? (
              <input ref={trimInRef} aria-label="Trim in" className="control-field tabular-nums text-center" style={{ width: trimFieldWidth, textAlign: 'center' }} value={trimInFieldValue} placeholder={trimInPlaceholder} onChange={(e) => setTrimInValue(e.target.value)} onBlur={commitTrimIn} onWheel={(e) => handleTrimWheel(e, 'in')} onKeyDown={(e) => { if (e.key === 'Enter') commitTrimIn(); if (e.key === 'Escape') setTrimInValue(inText) }} />
            ) : (
              <SegmentedTimeInput
                ref={trimInRef}
                ariaLabel="Trim in"
                className="control-field tabular-nums text-center"
                style={{ width: trimFieldWidth, textAlign: 'center' }}
                valueSeconds={fps > 0 ? frameToTime(start, fps) : 0}
                maxSeconds={duration}
                onCommit={commitTrimInSeconds}
              />
            )}
            <div className="relative h-7 w-12 shrink-0 overflow-visible pointer-events-none select-none" aria-hidden="true">
              <TrimRibbonVisual
                inPct={trimMockInPct}
                outPct={trimMockOutPct}
                collapsedSelection={false}
                keyframePcts={trimMockKeyframePcts}
                showHandles={true}
                handleWidthPx={3}
              />
            </div>
            {showFrames ? (
              <input ref={trimOutRef} aria-label="Trim out" className="control-field tabular-nums text-center" style={{ width: trimFieldWidth, textAlign: 'center' }} value={trimOutFieldValue} placeholder={trimOutPlaceholder} onChange={(e) => setTrimOutValue(e.target.value)} onBlur={commitTrimOut} onWheel={(e) => handleTrimWheel(e, 'out')} onKeyDown={(e) => { if (e.key === 'Enter') commitTrimOut(); if (e.key === 'Escape') setTrimOutValue(outText) }} />
            ) : (
              <SegmentedTimeInput
                ref={trimOutRef}
                ariaLabel="Trim out"
                className="control-field tabular-nums text-center"
                style={{ width: trimFieldWidth, textAlign: 'center' }}
                valueSeconds={fps > 0 ? frameToTime(end, fps) : 0}
                maxSeconds={duration}
                onCommit={commitTrimOutSeconds}
              />
            )}
            <span className="shrink-0 text-text-muted select-text cursor-text">]</span>
            {isTrimmed && (
              <SettingResetButton label="Reset trim" onClick={resetTrim} />
            )}
          </PropertyRow>

          <GroupTitle title="output sizing + timing" />
          <PropertyRow label="fps" labelWidth={labelWidth}>
            <input
              ref={fpsInputRef}
              aria-label="Output FPS"
              className="control-field control-field-number w-20 tabular-nums"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              min={1}
              max={sourceFpsMax}
              step={1}
              value={fpsOverrideValue}
              placeholder={sourceFpsPlaceholder}
              onChange={(e) => handleFpsOverrideChange(e.target.value)}
              onWheel={handleFpsWheel}
            />
            {videoProps.fps !== null && (
              <SettingResetButton label="Reset output FPS" onClick={() => setVideoProps({ fps: null })} />
            )}
          </PropertyRow>
          <PropertyRow label="resolution" labelWidth={labelWidth}>
            <LinkedDimensionInput
              width={videoProps.width}
              height={videoProps.height}
              linked={videoProps.keepAspectRatio}
              sourceAspect={sourceScaleAspect}
              sourceWidth={sourceScaleWidth}
              sourceHeight={sourceScaleHeight}
              widthPlaceholder={sourceWidthPlaceholder}
              heightPlaceholder={sourceHeightPlaceholder}
              onWidthChange={handleResWidthChange}
              onHeightChange={handleResHeightChange}
              onLinkedChange={handleResLinkedChange}
              ariaPrefix="Output"
            />
            {resScaleFactor !== null && (
              <span
                className="text-[11px] font-mono text-text-muted select-text cursor-text"
                title={`${resScaleFactor < 1 ? 'Downscaled' : 'Upscaled'} to ${(resScaleFactor * 100).toFixed(0)}% of source`}
              >
                {resScaleFactor.toFixed(2).replace(/\.?0+$/, '')}×
              </span>
            )}
            {hasResolutionOverride && (
              <SettingResetButton label="Reset output resolution" onClick={() => setVideoProps({ width: null, height: null })} />
            )}
          </PropertyRow>

          <GroupTitle title="video encoding" />
          <PropertyRow label="codec" labelWidth={labelWidth}>
            <select aria-label="Video codec" className="control-field" value={videoProps.codec} onChange={(e) => setVideoProps({ codec: e.target.value as VideoCodec })}>
              {VIDEO_CODECS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {videoProps.codec !== 'copy' && (
              <SettingResetButton label="Reset video codec" onClick={() => setVideoProps({ codec: 'copy' })} />
            )}
          </PropertyRow>
          <PropertyRow label="video track" labelWidth={labelWidth}>
            <select
              aria-label="Video track"
              className="control-field"
              value={videoProps.trackIndex === null ? 'none' : String(videoProps.trackIndex)}
              onChange={(e) => {
                const nextTrackIndex = e.target.value === 'none' ? null : parseInt(e.target.value, 10)
                setVideoProps({ trackIndex: nextTrackIndex })
                if (nextTrackIndex === null) setCrop(null)
              }}
            >
              <option value="none">none (audio only)</option>
              {probe.videoTracks.map((t) => (
                <option key={t.index} value={t.index}>{t.label}</option>
              ))}
            </select>
            {videoProps.trackIndex !== defaultVideoTrackIndex && (
              <SettingResetButton label="Reset video track" onClick={() => {
                setVideoProps({ trackIndex: defaultVideoTrackIndex })
                if (defaultVideoTrackIndex === null) setCrop(null)
              }} />
            )}
          </PropertyRow>
        </div>
      )}

      {activeTab === 'audio' && (
        <div className="control-row flex flex-col" style={{ gap: 'calc(var(--wasmux-edge-space) / 2)' }}>
          <InlineSummary items={audioSummary} />

          <GroupTitle title="audio output" />
          <PropertyRow label="codec" labelWidth={labelWidth}>
            <select aria-label="Audio codec" className="control-field" value={audioProps.codec} onChange={(e) => setAudioProps({ codec: e.target.value as AudioCodec })}>
              {AUDIO_CODECS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {audioProps.codec !== 'copy' && (
              <SettingResetButton label="Reset audio codec" onClick={() => setAudioProps({ codec: 'copy' })} />
            )}
          </PropertyRow>
          <PropertyRow label="audio track" labelWidth={labelWidth}>
            <select
              aria-label="Audio track"
              className="control-field"
              value={audioProps.trackIndex === null ? 'none' : String(audioProps.trackIndex)}
              onChange={(e) => setAudioProps({ trackIndex: e.target.value === 'none' ? null : parseInt(e.target.value, 10) })}
            >
              <option value="none">none (video only)</option>
              {probe.audioTracks.map((t) => (
                <option key={t.index} value={t.index}>{t.label}</option>
              ))}
            </select>
            {audioProps.trackIndex !== defaultAudioTrackIndex && (
              <SettingResetButton label="Reset audio track" onClick={() => setAudioProps({ trackIndex: defaultAudioTrackIndex })} />
            )}
          </PropertyRow>
        </div>
      )}
    </div>
  )
}

export const PropertiesPanel = memo(PropertiesPanelImpl)
