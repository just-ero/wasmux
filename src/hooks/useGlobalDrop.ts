/**
 * useglobaldrop.ts - global drag-and-drop + paste handler.
 *
 * this hook attaches event listeners to the `window` so that
 * file drops and pastes work anywhere on the page - landing page,
 * editor, doesn't matter. it tracks whether the user is currently
 * dragging a file over the browser window and exposes that as
 * `isdragging` so an overlay can be shown.
 *
 * why window-level?
 *  - the user should never have to aim for a specific zone.
 *  - even after a file is loaded (editor view), dragging a new
 *    file over the window should offer to replace / append.
 *
 * the file validation (extension + size) lives in lib/filevalidation.ts
 * and is reused by both this hook and the browse-file input.
 *
 * dragcount ref:
 *   every child element fires its own dragenter / dragleave pair
 *   as the cursor moves over the page. we keep a counter so we
 *   only clear `isdragging` when the cursor truly leaves the
 *   window (counter hits 0), not when it crosses a child boundary.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { validateFile } from '../lib/fileValidation'

interface UseGlobalDropOptions {
  /** called with the validated file when a drop or paste succeeds. */
  onFile: (file: File) => void
  /** called with an error string if validation fails. */
  onError: (message: string) => void
}

export function useGlobalDrop({ onFile, onError }: UseGlobalDropOptions) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCount = useRef(0)

  const hasFilePayload = (dt: DataTransfer | null | undefined) => {
    if (!dt) return false
    if (dt.files && dt.files.length > 0) return true
    return Array.from(dt.types ?? []).includes('Files')
  }

  /** validate then forward a file, or report an error. */
  const handleFile = useCallback(
    (file: File) => {
      const err = validateFile(file)
      if (err) {
        onError(err)
      } else {
        onFile(file)
      }
    },
    [onFile, onError],
  )

  useEffect(() => {
    // ── drag tracking ──────────────────────────────────────
    const onDragEnter = (e: DragEvent) => {
      if (!hasFilePayload(e.dataTransfer)) return
      e.preventDefault()
      dragCount.current++
      if (dragCount.current === 1) setIsDragging(true)
    }

    const onDragOver = (e: DragEvent) => {
      if (!hasFilePayload(e.dataTransfer)) return
      // must prevent default so the browser allows the drop.
      e.preventDefault()
    }

    const onDragLeave = (e: DragEvent) => {
      if (!isDragging) return
      e.preventDefault()
      dragCount.current--
      if (dragCount.current <= 0) {
        dragCount.current = 0
        setIsDragging(false)
      }
    }

    const onDrop = (e: DragEvent) => {
      if (!hasFilePayload(e.dataTransfer)) return
      e.preventDefault()
      dragCount.current = 0
      setIsDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file) handleFile(file)
    }

    // ── paste tracking ─────────────────────────────────────
    const onPaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files[0]
      if (file) {
        e.preventDefault()
        handleFile(file)
      }
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)

    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
    }
  }, [handleFile])

  return { isDragging } as const
}
