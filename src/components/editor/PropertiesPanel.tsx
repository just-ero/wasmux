import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import * as Icons from '@/components/shared/Icons'
import { DangerXButton } from '@/components/shared/DangerXButton'
import { TrimRibbonVisual } from '@/components/editor/TrimRibbonVisual'
import { useEditorStore } from '@/stores/editorStore'
import { clampFrame, formatFrameCompact, formatFramePadded, formatTime, frameToTime, timeToFrame } from '@/lib/frameUtils'
import type { AudioCodec, VideoCodec } from '@/types/editor'

const VIDEO_CODECS: VideoCodec[] = ['copy', 'libx264', 'libvpx-vp9', 'mpeg4', 'libtheora']
const AUDIO_CODECS: AudioCodec[] = ['copy', 'aac', 'libmp3lame', 'libvorbis', 'libopus', 'flac', 'ac3']

function parseIntOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

function GroupTitle({ title }: { title: string }) {
  return (
    <div className="pt-1 text-[12px] font-semibold text-text/90">
      <span className="select-text cursor-text">{title}</span>
      <div className="mt-0.5 h-px bg-border/60" />
    </div>
  )
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

  const fps = probe?.fps ?? 0
  const duration = probe?.duration ?? 0
  const sel = selections[0]
  const start = sel?.start ?? 0
  const end = sel?.end ?? Math.max(0, totalFrames - 1)
  const effectiveCrop = crop ?? { x: 0, y: 0, width: probe?.width ?? 0, height: probe?.height ?? 0 }
  const hasVideoTrackSelected = videoProps.trackIndex !== null
  const inText = showFrames ? formatFrameCompact(start) : formatTime(fps > 0 ? frameToTime(start, fps) : 0, duration)
  const outText = showFrames ? formatFrameCompact(end) : formatTime(fps > 0 ? frameToTime(end, fps) : 0, duration)
  const trimDisplayInText = showFrames ? formatFramePadded(start, totalFrames) : inText
  const trimDisplayOutText = showFrames ? formatFramePadded(end, totalFrames) : outText
  const trimFieldWidth = `${Math.max(16, Math.max(trimDisplayInText.length, trimDisplayOutText.length) + 4)}ch`
  const trimMockInPct = 0
  const trimMockOutPct = 100
  const trimMockKeyframePcts: number[] = []
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
        id: 'resolution',
        text: `resolution ${probe.width > 0 && probe.height > 0 ? `${probe.width}x${probe.height}` : 'missing'}`,
        title: 'Source video resolution reported by the file.',
      },
      {
        id: 'fps',
        text: `fps ${probe.fps ? String(probe.fps) : 'missing'}`,
        title: 'Source frame rate reported by the file.',
      },
      {
        id: 'bitrate',
        text: `bitrate ${videoBitrate.text}`,
        title: videoBitrate.title,
        showInfoIcon: videoBitrate.showInfoIcon,
      },
    ] satisfies SummaryItem[]
  }, [probe, videoBitrate.showInfoIcon, videoBitrate.text, videoBitrate.title])

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
    if (/^\d+$/.test(trimmed)) return clampFrame(parseInt(trimmed, 10), totalFrames)
    const parts = trimmed.split(':')
    let secs = 0
    if (parts.length === 1) secs = parseFloat(parts[0])
    else if (parts.length === 2) secs = parseInt(parts[0], 10) * 60 + parseFloat(parts[1])
    else if (parts.length === 3) secs = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2])
    else return null
    if (Number.isNaN(secs) || !Number.isFinite(secs) || secs < 0) return null
    return clampFrame(fps > 0 ? timeToFrame(secs, fps) : 0, totalFrames)
  }, [fps, totalFrames])

  const setCropField = useCallback((field: 'x' | 'y' | 'width' | 'height', raw: string) => {
    const next = parseIntOrNull(raw)
    if (next === null) return
    setCrop({ ...effectiveCrop, [field]: Math.max(0, next) })
  }, [effectiveCrop, setCrop])

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
              <input aria-label="Crop X" className="control-field control-field-number w-20 tabular-nums" type="number" value={effectiveCrop.x} onChange={(e) => setCropField('x', e.target.value)} />
              <span className="text-[12px] text-text-muted select-text cursor-text">y</span>
              <input aria-label="Crop Y" className="control-field control-field-number w-20 tabular-nums" type="number" value={effectiveCrop.y} onChange={(e) => setCropField('y', e.target.value)} />
              <span className="text-[12px] text-text-muted select-text cursor-text">w</span>
              <input aria-label="Crop width" className="control-field control-field-number w-20 tabular-nums" type="number" value={effectiveCrop.width} onChange={(e) => setCropField('width', e.target.value)} />
              <span className="text-[12px] text-text-muted select-text cursor-text">h</span>
              <input aria-label="Crop height" className="control-field control-field-number w-20 tabular-nums" type="number" value={effectiveCrop.height} onChange={(e) => setCropField('height', e.target.value)} />
              {crop && (
                <DangerXButton label="Clear crop (Esc)" onClick={() => setCrop(null)} />
              )}
            </PropertyRow>
          )}
          <PropertyRow label="trim" labelWidth={labelWidth}>
            <span className="shrink-0 text-text-muted select-text cursor-text">[</span>
            <input aria-label="Trim in" className="control-field tabular-nums text-center" style={{ width: trimFieldWidth, textAlign: 'center' }} value={trimInValue} onChange={(e) => setTrimInValue(e.target.value)} onBlur={commitTrimIn} onKeyDown={(e) => { if (e.key === 'Enter') commitTrimIn(); if (e.key === 'Escape') setTrimInValue(inText) }} />
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
            <input aria-label="Trim out" className="control-field tabular-nums text-center" style={{ width: trimFieldWidth, textAlign: 'center' }} value={trimOutValue} onChange={(e) => setTrimOutValue(e.target.value)} onBlur={commitTrimOut} onKeyDown={(e) => { if (e.key === 'Enter') commitTrimOut(); if (e.key === 'Escape') setTrimOutValue(outText) }} />
            <span className="shrink-0 text-text-muted select-text cursor-text">]</span>
          </PropertyRow>

          <GroupTitle title="video output" />
          <PropertyRow label="codec" labelWidth={labelWidth}>
            <select aria-label="Video codec" className="control-field" value={videoProps.codec} onChange={(e) => setVideoProps({ codec: e.target.value as VideoCodec })}>
              {VIDEO_CODECS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
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
          </PropertyRow>
        </div>
      )}
    </div>
  )
}

export const PropertiesPanel = memo(PropertiesPanelImpl)
