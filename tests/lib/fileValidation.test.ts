import { describe, it, expect } from 'vitest'
import { formatSize, validateFile } from '@/lib/fileValidation'
import { MAX_FILE_SIZE } from '@/types/editor'

/* formatsize */
describe('formatSize', () => {
  it('formats bytes as KB', () => {
    expect(formatSize(512 * 1024)).toBe('512 KB')
  })

  it('formats bytes as MB', () => {
    expect(formatSize(150 * 1024 * 1024)).toBe('150 MB')
  })

  it('formats bytes as GB', () => {
    expect(formatSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB')
  })
})

/* validatefile */
function fakeFile(name: string, size: number): File {
  return new File([new ArrayBuffer(0)], name, { type: '' })
    // file constructor ignores the size of the passed buffer for .size,
    // but we need to control it - override via defineproperty.
    && Object.defineProperty(
      new File([new ArrayBuffer(0)], name),
      'size',
      { value: size },
    ) as File
}

describe('validateFile', () => {
  it('accepts a valid .mp4 file', () => {
    expect(validateFile(fakeFile('clip.mp4', 1024))).toBeNull()
  })

  it('accepts a valid .webm file', () => {
    expect(validateFile(fakeFile('video.webm', 1024))).toBeNull()
  })

  it('rejects an unsupported extension', () => {
    const err = validateFile(fakeFile('photo.jpg', 1024))
    expect(err).toMatch(/unsupported/i)
    expect(err).toContain('.jpg')
  })

  it('rejects a file with no extension', () => {
    const err = validateFile(fakeFile('README', 1024))
    expect(err).toMatch(/unsupported/i)
  })

  it('rejects a file that exceeds MAX_FILE_SIZE', () => {
    const err = validateFile(fakeFile('huge.mp4', MAX_FILE_SIZE + 1))
    expect(err).toMatch(/too large/i)
  })

  it('accepts a file exactly at MAX_FILE_SIZE', () => {
    expect(validateFile(fakeFile('edge.mp4', MAX_FILE_SIZE))).toBeNull()
  })

  it('is case-insensitive on extension', () => {
    expect(validateFile(fakeFile('CLIP.MP4', 1024))).toBeNull()
  })
})
