/** window-level drag/drop + paste file handler. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { validateFile } from '@/lib/fileValidation'
import type { NativeFileHandle } from '@/types/editor'

interface UseGlobalDropOptions {
  /** called with the validated file when a drop or paste succeeds. */
  onFile: (file: File, sourceHandle?: NativeFileHandle | null) => void
  /** called with an error string if validation fails. */
  onError: (message: string) => void
}

interface DataTransferItemWithFsHandle extends DataTransferItem {
  getAsFileSystemHandle?: () => Promise<{ kind?: string } | null>
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
    (file: File, sourceHandle?: NativeFileHandle | null) => {
      const err = validateFile(file)
      if (err) {
        onError(err)
      } else {
        onFile(file, sourceHandle ?? null)
      }
    },
    [onFile, onError],
  )

  useEffect(() => {
    // drag tracking
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

      void (async () => {
        const file = e.dataTransfer?.files[0]
        if (!file) return

        let sourceHandle: NativeFileHandle | null = null
        const item = e.dataTransfer?.items?.[0] as DataTransferItemWithFsHandle | undefined
        if (item?.getAsFileSystemHandle) {
          try {
            const fsHandle = await item.getAsFileSystemHandle()
            if (fsHandle && fsHandle.kind === 'file') {
              sourceHandle = fsHandle as unknown as NativeFileHandle
            }
          } catch {
            // best-effort only; fallback still works without a native handle.
          }
        }

        handleFile(file, sourceHandle)
      })()
    }

    // paste tracking
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
