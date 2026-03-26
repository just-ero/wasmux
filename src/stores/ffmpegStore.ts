/** ffmpeg load status store. */

import { create } from 'zustand'
import type { FFmpegStatus } from '@/types/editor'

interface FFmpegState {
  status: FFmpegStatus
  setStatus: (s: FFmpegStatus) => void
}

export const useFFmpegStore = create<FFmpegState>((set) => ({
  status: 'idle',
  setStatus: (status) => set({ status }),
}))
