/**
 * filevalidation.ts - shared file validation logic.
 *
 * used by both the global drop/paste handler (useglobaldrop)
 * and the browse-file <input>. validates:
 *   1. file extension is in supported_extensions
 *   2. file size is within max_file_size
 *
 * returns null if valid, or a human-readable error string.
 */

import { MAX_FILE_SIZE, SUPPORTED_EXTENSIONS } from '../types/editor'

/** format a byte count as a human-readable string (kb / mb / gb). */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

/**
 * check if a file is supported and within size limits.
 * @returns null if ok, or an error message string.
 */
export function validateFile(file: File): string | null {
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''

  if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
    return `Unsupported format: ${ext || '(no extension)'}`
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large: ${formatSize(file.size)} (max ${formatSize(MAX_FILE_SIZE)})`
  }
  return null
}
