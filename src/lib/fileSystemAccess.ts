import type { NativeFileHandle } from '../types/editor'

interface PickerTypeDescriptor {
  description?: string
  accept: Record<string, string[]>
}

interface NativeOpenFilePickerOptions {
  excludeAcceptAllOption?: boolean
  multiple?: boolean
  types?: PickerTypeDescriptor[]
}

interface NativeSaveFilePickerOptions {
  excludeAcceptAllOption?: boolean
  suggestedName?: string
  startIn?: NativeFileHandle | null
  types?: PickerTypeDescriptor[]
}

interface WindowWithFileSystemAccess extends Window {
  showOpenFilePicker?: (options?: NativeOpenFilePickerOptions) => Promise<NativeFileHandle[]>
  showSaveFilePicker?: (options?: NativeSaveFilePickerOptions) => Promise<NativeFileHandle>
}

function getPickerWindow(): WindowWithFileSystemAccess {
  return window as WindowWithFileSystemAccess
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function supportsNativeOpenFilePicker(): boolean {
  return typeof getPickerWindow().showOpenFilePicker === 'function'
}

export function supportsNativeSaveFilePicker(): boolean {
  return typeof getPickerWindow().showSaveFilePicker === 'function'
}

export async function showNativeOpenFilePicker(extensions: readonly string[]): Promise<{ file: File; handle: NativeFileHandle } | null> {
  const showOpenFilePicker = getPickerWindow().showOpenFilePicker
  if (!showOpenFilePicker) return null

  try {
    const [handle] = await showOpenFilePicker({
      multiple: false,
      excludeAcceptAllOption: true,
      types: [{
        description: 'Supported media',
        accept: { 'application/octet-stream': [...extensions] },
      }],
    })

    if (!handle?.getFile) return null
    const file = await handle.getFile()
    return { file, handle }
  } catch (error) {
    if (isAbortError(error)) return null
    throw error
  }
}

export async function showNativeSaveFilePicker(options: NativeSaveFilePickerOptions): Promise<{ handle: NativeFileHandle } | null> {
  const showSaveFilePicker = getPickerWindow().showSaveFilePicker
  if (!showSaveFilePicker) return null

  try {
    const handle = await showSaveFilePicker({
      excludeAcceptAllOption: true,
      suggestedName: options.suggestedName,
      startIn: options.startIn ?? undefined,
      types: options.types,
    })

    return { handle }
  } catch (error) {
    if (isAbortError(error)) return null
    throw error
  }
}
