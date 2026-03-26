/** global editor state store. */

import { create } from 'zustand'
import type {
  AudioProps,
  CommandCenterTab,
  CropRegion,
  IngestionStatus,
  MediaFile,
  OutputFormat,
  ProbeResult,
  Selection,
  VideoProps,
} from '../types/editor'

/* sensible defaults for a freshly-loaded file */
const defaultVideoProps: VideoProps = {
  codec: 'copy',        // stream-copy by default (fastest, lossless)
  preset: 'medium',
  crf: 23,
  profile: 'high',
  tune: '',
  width: null,          // null = keep source
  height: null,
  fps: null,
  speed: 1,
  gifFps: null,
  gifWidth: null,
  gifHeight: null,
  trackIndex: 0,        // first video track
  subtitleTrackIndex: null,
  keepAspectRatio: true,
}

const defaultAudioProps: AudioProps = {
  codec: 'copy',
  bitrate: 128,
  volume: 1,            // 100 %
  speed: 1,
  pitch: 0,             // no shift
  trackIndex: 0,        // first audio track
}

/* store interface */
interface EditorState {
  // source
  file: MediaFile | null
  probe: ProbeResult | null

  // playback / preview
  /** blob:// url for the preview player (may be transcoded). */
  previewUrl: string | null
  /** total frame count (derived from duration * fps). */
  totalFrames: number
  /** current playhead position in frames. */
  currentFrame: number
  /** keyframe positions (frame numbers), populated asynchronously. */
  keyframes: number[]
  /** where we are in the ingestion pipeline. */
  ingestionStatus: IngestionStatus

  // non-destructive editing parameters
  selections: Selection[]     // frame-based ranges included in output
  crop: CropRegion | null     // null = no crop
  cropMode: boolean           // whether the crop overlay is active
  videoProps: VideoProps
  audioProps: AudioProps
  outputFormat: OutputFormat

  // ui state
  activeTab: CommandCenterTab
  isExporting: boolean
    /** whether the time display shows frames instead of wall-clock time. */
    showFrames: boolean

    // actions
  /** load a new file and reset all editing state. */
  loadFile: (file: MediaFile, probe: ProbeResult) => void
  /** clear everything (back to landing page). */
  reset: () => void
  /** set the preview blob url, revoking any previous one first. */
  setPreviewUrl: (url: string | null) => void
  setCurrentFrame: (f: number) => void
  setKeyframes: (kf: number[]) => void
  setIngestionStatus: (s: IngestionStatus) => void
  setSelections: (s: Selection[]) => void
  setInPoint: (frame: number) => void
  setOutPoint: (frame: number) => void
  setCrop: (c: CropRegion | null) => void
  setCropMode: (v: boolean) => void
  setVideoProps: (p: Partial<VideoProps>) => void
  setAudioProps: (p: Partial<AudioProps>) => void
  setOutputFormat: (f: OutputFormat) => void
  setActiveTab: (t: CommandCenterTab) => void
  setExporting: (v: boolean) => void
    setShowFrames: (v: boolean) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  file: null,
  probe: null,
  previewUrl: null,
  totalFrames: 0,
  currentFrame: 0,
  keyframes: [],
  ingestionStatus: 'idle',
  selections: [],
  crop: null,
  cropMode: false,
  videoProps: { ...defaultVideoProps },
  audioProps: { ...defaultAudioProps },
  outputFormat: 'source',
    activeTab: 'console',
  isExporting: false,
    showFrames: false,

  loadFile: (file, probe) => {
    const totalFrames = probe.fps > 0 ? Math.round(probe.duration * probe.fps) : 0
    set({
      file,
      probe,
      totalFrames,
      currentFrame: 0,
      keyframes: [],
      // one selection spanning all frames = "include everything".
      selections: [{ id: 'full', start: 0, end: Math.max(0, totalFrames - 1) }],
      crop: null,
      cropMode: false,
      videoProps: { ...defaultVideoProps, trackIndex: probe.videoTracks[0]?.index ?? null },
      audioProps: { ...defaultAudioProps, trackIndex: probe.audioTracks[0]?.index ?? null },
      outputFormat: 'source',
    })
  },

  reset: () =>
    set((s) => {
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl)
      return {
      file: null,
        probe: null,
      previewUrl: null,
      totalFrames: 0,
      currentFrame: 0,
      keyframes: [],
      ingestionStatus: 'idle',
      selections: [],
      crop: null,
      cropMode: false,
      videoProps: { ...defaultVideoProps },
      audioProps: { ...defaultAudioProps },
      outputFormat: 'source',
        activeTab: 'console',
      isExporting: false,
        showFrames: false,
    }}),

  setPreviewUrl: (previewUrl) =>
    set((s) => {
      if (s.previewUrl && s.previewUrl !== previewUrl) URL.revokeObjectURL(s.previewUrl)
      return { previewUrl }
    }),
  setCurrentFrame: (currentFrame) => set({ currentFrame }),
  setKeyframes: (keyframes) => set({ keyframes }),
  setIngestionStatus: (ingestionStatus) => set({ ingestionStatus }),
  setSelections: (selections) =>
    set((s) => {
      const total = s.totalFrames
      const validated = selections.map((sel) => ({
        ...sel,
        start: Math.max(0, Math.min(sel.start, sel.end)),
        end: total > 0 ? Math.min(sel.end, total - 1) : sel.end,
      }))
      return { selections: validated }
    }),
  setInPoint: (frame) =>
    set((s) => {
      const total = s.totalFrames
      const max = Math.max(0, total - 1)
      const clamped = Math.max(0, Math.min(frame, max))
      const current = s.selections[0]
      const end = current?.end ?? max

      return {
        selections: [{
          id: 'full',
          start: Math.min(clamped, end),
          end: Math.max(clamped, end),
        }],
      }
    }),
  setOutPoint: (frame) =>
    set((s) => {
      const total = s.totalFrames
      const max = Math.max(0, total - 1)
      const clamped = Math.max(0, Math.min(frame, max))
      const current = s.selections[0]
      const start = current?.start ?? 0

      return {
        selections: [{
          id: 'full',
          start: Math.min(start, clamped),
          end: Math.max(start, clamped),
        }],
      }
    }),
  setCrop: (crop) =>
    set((s) => {
      if (!crop) return { crop: null }
      const w = s.probe?.width ?? Infinity
      const h = s.probe?.height ?? Infinity
      return {
        crop: {
          x: Math.max(0, Math.min(crop.x, w)),
          y: Math.max(0, Math.min(crop.y, h)),
          width: Math.max(1, Math.min(crop.width, w - Math.max(0, crop.x))),
          height: Math.max(1, Math.min(crop.height, h - Math.max(0, crop.y))),
        },
      }
    }),
  setCropMode: (cropMode) => set({ cropMode }),

  setVideoProps: (p) =>
    set((s) => ({ videoProps: { ...s.videoProps, ...p } })),
  setAudioProps: (p) =>
    set((s) => ({ audioProps: { ...s.audioProps, ...p } })),

  setOutputFormat: (outputFormat) => set({ outputFormat }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setExporting: (isExporting) => set({ isExporting }),

  setShowFrames: (showFrames) => set({ showFrames }),
}))
