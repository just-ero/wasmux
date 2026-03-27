import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { exportFile, pickExportTarget } from '@/lib/exportFile'
import { clampFrame, formatTime, remapFrameIndex, totalFramesFromDuration } from '@/lib/frameUtils'
import { resolveOutputExtension } from '@/lib/outputFormats'
import * as Icons from '@/components/shared/Icons'
import { AUDIO_FORMATS, VIDEO_FORMATS } from '@/types/editor'
import type { OutputFormat } from '@/types/editor'
import type { FormatMenuItem } from '@/components/editor/FormatMenu'
import { FormatMenu } from '@/components/editor/FormatMenu'

export const ExportControls = memo(function ExportControls() {
  const file = useEditorStore((s) => s.file)
  const probe = useEditorStore((s) => s.probe)
  const selections = useEditorStore((s) => s.selections)
  const showFrames = useEditorStore((s) => s.showFrames)
  const outputFpsOverride = useEditorStore((s) => s.videoProps.fps)
  const isExporting = useEditorStore((s) => s.isExporting)

  const [formatMenuOpen, setFormatMenuOpen] = useState(false)

  const exportBtnRef = useRef<HTMLButtonElement>(null)
  const formatMenuId = 'export-format-menu'

  const sourceFps = probe?.fps ?? 0
  const displayFps = outputFpsOverride && outputFpsOverride > 0 ? outputFpsOverride : sourceFps
  const duration = probe?.duration ?? 0
  const sel = selections[0]
  const totalFrames = useEditorStore((s) => s.totalFrames)
  const selFrames = sel ? Math.max(0, sel.end - sel.start + 1) : 0
  const selSeconds = sourceFps > 0 ? selFrames / sourceFps : 0
  const selStart = sel?.start ?? 0
  const selEnd = sel?.end ?? Math.max(0, totalFrames - 1)
  const displayTotalFrames = displayFps > 0 && duration > 0
    ? totalFramesFromDuration(duration, displayFps)
    : totalFrames
  const selStartDisplay = remapFrameIndex(selStart, sourceFps, displayFps, displayTotalFrames)
  const selEndDisplay = remapFrameIndex(selEnd, sourceFps, displayFps, displayTotalFrames)
  const selFramesDisplay = Math.max(0, clampFrame(selEndDisplay, displayTotalFrames) - clampFrame(selStartDisplay, displayTotalFrames) + 1)
  const selectionText = showFrames
    ? `${selFramesDisplay}`
    : formatTime(selSeconds, duration)

  const formatOptions = useMemo<FormatMenuItem[]>(() => {
    const formatLabel = (format: string): string => {
      return `.${format}`
    }

    const sourceExt = file ? resolveOutputExtension('source', probe?.format, file.name) : 'mp4'
    const otherVideoFormats = VIDEO_FORMATS.filter((format) => format !== sourceExt)
    const otherAudioFormats = AUDIO_FORMATS.filter((format) => format !== sourceExt)

    const items: FormatMenuItem[] = [
      { kind: 'option', format: 'source', label: `${formatLabel(sourceExt)} (source)` },
    ]

    if (otherVideoFormats.length > 0) {
      items.push({ kind: 'separator', id: 'video-separator' })
      items.push(
        ...otherVideoFormats.map((format) => ({
          kind: 'option' as const,
          format,
          label: formatLabel(format),
        })),
      )
    }

    if (otherAudioFormats.length > 0) {
      items.push({ kind: 'separator', id: 'audio-separator' })
      items.push(
        ...otherAudioFormats.map((format) => ({
          kind: 'option' as const,
          format,
          label: formatLabel(format),
        })),
      )
    }

    return items
  }, [file, probe?.format])

  const onExportClick = useCallback(() => {
    const state = useEditorStore.getState()
    if (!state.file || !state.probe || state.isExporting) return
    setFormatMenuOpen((open) => !open)
  }, [])

  const onFormatSelect = useCallback(async (format: OutputFormat) => {
    setFormatMenuOpen(false)

    const state = useEditorStore.getState()
    if (!state.file || !state.probe) return

    const target = await pickExportTarget(
      state.file.name,
      state.file.sourceHandle ?? null,
      state.probe.format,
      format,
    )
    if (!target) return

    await exportFile({ target })
  }, [])

  if (!file) return null

  return (
    <>
      <div className="flex items-center" style={{ gap: 'var(--wasmux-control-gap)' }}>
        <span className="text-[12px] text-text-muted/85 tabular-nums whitespace-pre">selection: {selectionText}</span>
        <button
          ref={exportBtnRef}
          className="btn"
          onClick={onExportClick}
          disabled={isExporting}
          aria-label="Export"
          aria-haspopup="menu"
          aria-expanded={formatMenuOpen}
          aria-controls={formatMenuOpen ? formatMenuId : undefined}
          title="Export"
        >
          <Icons.Export width={16} height={16} />
        </button>
      </div>

      {formatMenuOpen && (
        <FormatMenu
          options={formatOptions}
          anchorRef={exportBtnRef}
          menuId={formatMenuId}
          onSelect={(fmt) => { void onFormatSelect(fmt) }}
          onClose={() => setFormatMenuOpen(false)}
        />
      )}
    </>
  )
})
