import { beforeEach, describe, expect, it, vi } from 'vitest'

const pickerMocks = vi.hoisted(() => ({
  supportsNativeSaveFilePicker: vi.fn(),
  showNativeSaveFilePicker: vi.fn(),
}))

vi.mock('@/lib/fileSystemAccess', () => ({
  supportsNativeSaveFilePicker: pickerMocks.supportsNativeSaveFilePicker,
  showNativeSaveFilePicker: pickerMocks.showNativeSaveFilePicker,
}))

import { pickExportTarget } from '@/lib/exportFile'

describe('pickExportTarget', () => {
  beforeEach(() => {
    pickerMocks.supportsNativeSaveFilePicker.mockReset()
    pickerMocks.showNativeSaveFilePicker.mockReset()
  })

  it('opens native picker with a single format type', async () => {
    pickerMocks.supportsNativeSaveFilePicker.mockReturnValue(true)
    pickerMocks.showNativeSaveFilePicker.mockResolvedValue({
      handle: { name: 'clip-wasmux.mkv' },
    })

    const target = await pickExportTarget('clip.mp4', null, 'mov,mp4,m4a,3gp,3g2,mj2', 'mkv')

    expect(target?.format).toBe('mkv')
    expect(pickerMocks.showNativeSaveFilePicker).toHaveBeenCalledTimes(1)

    const options = pickerMocks.showNativeSaveFilePicker.mock.calls[0][0]
    expect(options.suggestedName).toBe('clip-wasmux.mkv')
    expect(options.types).toEqual([
      {
        description: '.mkv',
        accept: { 'application/octet-stream': ['.mkv'] },
      },
    ])
  })

  it('resolves "source" format to the source file extension', async () => {
    pickerMocks.supportsNativeSaveFilePicker.mockReturnValue(true)
    pickerMocks.showNativeSaveFilePicker.mockResolvedValue({
      handle: { name: 'clip-wasmux.mp4' },
    })

    const target = await pickExportTarget('clip.mp4', null, 'mov,mp4,m4a,3gp,3g2,mj2', 'source')

    expect(target?.format).toBe('mp4')
    const options = pickerMocks.showNativeSaveFilePicker.mock.calls[0][0]
    expect(options.suggestedName).toBe('clip-wasmux.mp4')
    expect(options.types).toEqual([
      {
        description: '.mp4',
        accept: { 'application/octet-stream': ['.mp4'] },
      },
    ])
  })

  it('falls back to non-native target with the chosen format', async () => {
    pickerMocks.supportsNativeSaveFilePicker.mockReturnValue(false)

    const target = await pickExportTarget('clip.mp4', null, 'mov,mp4,m4a,3gp,3g2,mj2', 'source')

    expect(target).toEqual({
      fileHandle: null,
      fileName: 'clip-wasmux.mp4',
      format: 'source',
    })
    expect(pickerMocks.showNativeSaveFilePicker).not.toHaveBeenCalled()
  })
})
