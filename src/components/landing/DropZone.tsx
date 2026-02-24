/** hidden file input exposed via an imperative browse() handle. */

import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import { SUPPORTED_EXTENSIONS } from '../../types/editor'
import { validateFile } from '../../lib/fileValidation'
import { showNativeOpenFilePicker, supportsNativeOpenFilePicker } from '../../lib/fileSystemAccess'
import type { NativeFileHandle } from '../../types/editor'

export interface BrowseInputHandle {
  /** open the native file picker dialog. */
  browse: () => void
}

interface BrowseInputProps {
  /** called with a validated file after selection. */
  onFile: (file: File, sourceHandle?: NativeFileHandle | null) => void
  /** called with a user-facing validation error. */
  onError: (message: string) => void
}

export const BrowseInput = forwardRef<BrowseInputHandle, BrowseInputProps>(
  function BrowseInput({ onFile, onError }, ref) {
    const inputRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(ref, () => ({
      browse: () => {
        if (!supportsNativeOpenFilePicker()) {
          inputRef.current?.click()
          return
        }

        void (async () => {
          try {
            const selection = await showNativeOpenFilePicker(SUPPORTED_EXTENSIONS)
            if (!selection) return

            const err = validateFile(selection.file)
            if (err) {
              onError(err)
            } else {
              onFile(selection.file, selection.handle)
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            onError(message)
          }
        })()
      },
    }))

    /** validate and forward selected file, then reset input value. */
    const onChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
          const err = validateFile(file)
          if (err) {
            onError(err)
          } else {
            onFile(file)
          }
        }
        // let users pick the same file again.
        e.target.value = ''
      },
      [onFile, onError],
    )

    const accept = SUPPORTED_EXTENSIONS.join(',')

    return (
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onChange}
        className="hidden"
        tabIndex={-1}
        aria-hidden
      />
    )
  },
)
