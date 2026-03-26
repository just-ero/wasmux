/** shared file validation helpers. */

import { MAX_FILE_SIZE, SUPPORTED_EXTENSIONS } from '@/types/editor'

/** format bytes as kb/mb/gb text. */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

/** return null if valid, otherwise an error message. */
export function validateFile(file: File): string | null {
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''

  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return `Unsupported format: ${ext || '(no extension)'}`
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large: ${formatSize(file.size)} (max ${formatSize(MAX_FILE_SIZE)})`
  }
  return null
}
