import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { exportFile, pickExportTarget } from '../../lib/exportFile'
import { formatTime } from '../../lib/frameUtils'
import { resolveOutputExtension } from '../../lib/outputFormats'
import * as Icons from '../shared/Icons'
import type { OutputFormat } from '../../types/editor'
import { GifExportDialog } from './GifExportDialog'
import { FormatMenu } from './FormatMenu'

export const ExportControls = memo(function ExportControls() {
  const file = useEditorStore((s) => s.file)
  const probe = useEditorStore((s) => s.probe)
  const selections = useEditorStore((s) => s.selections)
  const showFrames = useEditorStore((s) => s.showFrames)
  const crop = useEditorStore((s) => s.crop)
  const videoProps = useEditorStore((s) => s.videoProps)
  const setVideoProps = useEditorStore((s) => s.setVideoProps)
  const isExporting = useEditorStore((s) => s.isExporting)
  const hasAudio = useEditorStore((s) => s.audioProps.trackIndex !== null)

  const [audioOnlyWarning, setAudioOnlyWarning] = useState<string | null>(null)
  const [pendingGifFormat, setPendingGifFormat] = useState<OutputFormat | null>(null)
  const [formatMenuOpen, setFormatMenuOpen] = useState(false)

  const exportBtnRef = useRef<HTMLButtonElement>(null)
  const formatMenuId = 'export-format-menu'

  const fps = probe?.fps ?? 0
  const duration = probe?.duration ?? 0
  const hasVideo = videoProps.trackIndex !== null
  const sel = selections[0]
  const selFrames = sel ? Math.max(0, sel.end - sel.start + 1) : 0
  const selSeconds = fps > 0 ? selFrames / fps : 0
  const selectionText = showFrames ? `${selFrames}` : formatTime(selSeconds, duration)

  const gifMaxWidth = crop?.width ?? probe?.width ?? 1
  const gifMaxHeight = crop?.height ?? probe?.height ?? 1
  const gifAspectRatio = gifMaxWidth > 0 && gifMaxHeight > 0 ? gifMaxWidth / gifMaxHeight : 1

  const allowedFormats: OutputFormat[] = useMemo(
    () => (hasVideo ? ['source', 'avi', 'flv', 'gif', 'mkv', 'mov', 'mp4', 'ogg', 'webm'] : ['source', 'mp3', 'ogg', 'wav']),
    [hasVideo],
  )

  const formatOptions = useMemo(() => {
    const sourceExt = file ? resolveOutputExtension('source', probe?.format, file.name) : null
    return allowedFormats
      .filter((fmt) => fmt === 'source' || fmt !== sourceExt)
      .map((fmt) => ({
        format: fmt,
        label: fmt === 'source' ? `.${sourceExt ?? 'mp4'} (source)` : `.${fmt}`,
      }))
  }, [allowedFormats, file, probe?.format])

  const onExportClick = useCallback(() => {
    const state = useEditorStore.getState()
    if (!state.file || !state.probe || state.isExporting) return

    if (!hasVideo && hasAudio) {
      setAudioOnlyWarning('video track disabled: export formats limited to source/mp3/ogg/wav')
    } else {
      setAudioOnlyWarning(null)
    }

    setFormatMenuOpen((open) => !open)
  }, [hasAudio, hasVideo])

  const onFormatSelect = useCallback(async (format: OutputFormat) => {
    setFormatMenuOpen(false)
    if (format === 'gif') {
      setPendingGifFormat(format)
      return
    }

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

  const onConfirmGifOptions = useCallback(async (options: {
    gifFps: number
    gifWidth: number | null
    gifHeight: number | null
    keepAspectRatio: boolean
  }) => {
    if (!pendingGifFormat) return

    setVideoProps({
      gifFps: options.gifFps,
      gifWidth: options.gifWidth,
      gifHeight: options.gifHeight,
      keepAspectRatio: options.keepAspectRatio,
    })

    setPendingGifFormat(null)

    // let the modal close before opening the native save dialog.
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

    const state = useEditorStore.getState()
    if (!state.file || !state.probe) return

    const target = await pickExportTarget(
      state.file.name,
      state.file.sourceHandle ?? null,
      state.probe.format,
      pendingGifFormat,
    )
    if (!target) return

    await exportFile({ target })
  }, [pendingGifFormat, setVideoProps])

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

      {audioOnlyWarning && (
        <div className="px-2 pb-2 text-[11px] text-text-muted/80 text-right select-text">{audioOnlyWarning}</div>
      )}

      <GifExportDialog
        isOpen={pendingGifFormat !== null}
        sourceFps={probe?.fps ?? 0}
        maxWidth={gifMaxWidth}
        maxHeight={gifMaxHeight}
        aspectRatio={gifAspectRatio}
        initialFps={videoProps.gifFps}
        initialWidth={videoProps.gifWidth}
        initialHeight={videoProps.gifHeight}
        initialKeepAspectRatio={videoProps.keepAspectRatio}
        onCancel={() => setPendingGifFormat(null)}
        onConfirm={(options) => { void onConfirmGifOptions(options) }}
      />
    </>
  )
})
