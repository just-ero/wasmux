/**
 * ffmpegstore.ts - ffmpeg engine readiness state.
 *
 * tracks whether the ffmpeg wasm binary has been downloaded,
 * initialised, and is ready to accept exec() calls. components
 * that depend on ffmpeg (e.g. the file ingestion pipeline) can
 * subscribe to `status` and gate their work accordingly.
 */

import { create } from 'zustand'
import type { FFmpegStatus } from '../types/editor'

interface FFmpegState {
  status: FFmpegStatus
  setStatus: (s: FFmpegStatus) => void
}

export const useFFmpegStore = create<FFmpegState>((set) => ({
  status: 'idle',
  setStatus: (status) => set({ status }),
}))
