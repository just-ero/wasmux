/** shared editor types and constants. */

/* file and media metadata */

/** the user's source file as it lives in memory. */
export interface NativeWritableFileStream {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
}

export interface NativeFileHandle {
  name: string
  getFile?: () => Promise<File>
  createWritable?: () => Promise<NativeWritableFileStream>
}

export interface MediaFile {
  /** original filename (e.g. "clip.mp4") */
  name: string
  /** size in bytes */
  size: number
  /** mime type reported by the browser (may be empty for some formats) */
  type: string
  /** a blob:// url created via url.createobjecturl, used by <video> for playback */
  objectUrl: string
  /** native file handle when the browser exposes one via the file picker. */
  sourceHandle?: NativeFileHandle | null
}

/** one track (video / audio / subtitle) inside the source file. */
export interface TrackInfo {
  /** stream index as reported by ffmpeg (0-based) */
  index: number
  /** codec name, e.g. "h264", "aac", "subrip" */
  codec: string
  /** human-readable label we build from the codec + language if available */
  label: string
}

/** parsed metadata from ffmpeg -i output. */
export interface ProbeResult {
  duration: number       // total length in seconds
  width: number          // video width in pixels
  height: number         // video height in pixels
  fps: number            // frames per second (0 if no video)
  videoCodec: string     // e.g. "h264"
  audioCodec: string     // e.g. "aac"
  containerBitrate: number // kbps for the whole file/container (0 if unknown)
  videoBitrate: number   // kbps (0 if unknown)
  audioBitrate: number   // kbps (0 if unknown)
  audioSampleRate: number // hz (e.g. 44100)
  audioChannels: number  // channel count (e.g. 2 for stereo)
  videoTracks: TrackInfo[]
  audioTracks: TrackInfo[]
  subtitleTracks: TrackInfo[]
  format: string         // container format name, e.g. "mp4", "matroska"
}

/* editing parameters (non-destructive) */

/** crop rectangle in *source-pixel* coordinates (not display pixels). */
export interface CropRegion {
  x: number
  y: number
  width: number
  height: number
}

/** a contiguous included section of the timeline (frame-based). */
export interface Selection {
  /** unique identifier so react can key on it. */
  id: string
  /** start frame (integer). */
  start: number
  /** end frame (integer, inclusive). */
  end: number
}

/* codec / option enums */
export type VideoCodec =
  | 'copy'          // stream-copy (no re-encode)
  | 'libx264'       // h.264 / avc
  | 'libvpx-vp9'    // vp9
  | 'mpeg4'         // mpeg-4 part 2
  | 'libtheora'     // theora

export type AudioCodec =
  | 'copy'
  | 'aac'
  | 'libmp3lame'    // mp3
  | 'libvorbis'     // vorbis
  | 'libopus'       // opus
  | 'flac'
  | 'ac3'           // dolby digital

export type VideoPreset =
  | 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast'
  | 'medium' | 'slow' | 'slower' | 'veryslow'

export type VideoProfile = 'baseline' | 'main' | 'high'

export type VideoTune =
  | 'film' | 'animation' | 'grain' | 'stillimage'
  | 'fastdecode' | 'zerolatency'
  | ''   // empty = no tune

/** all video encoding / transform parameters. */
export interface VideoProps {
  codec: VideoCodec
  preset: VideoPreset
  crf: number              // constant rate factor, 0 (lossless) - 51 (worst)
  profile: VideoProfile
  tune: VideoTune
  width: number | null     // null = keep source resolution
  height: number | null
  fps: number | null       // output fps override (timeline/source frame count still uses probe.fps)
  speed: number            // playback speed multiplier, 0.25 - 4
  trackIndex: number | null // which video stream to use (null = no video / audio-only export)
  subtitleTrackIndex: number | null // burn-in subs (null = none)
  keepAspectRatio: boolean
}

/** all audio encoding / transform parameters. */
export interface AudioProps {
  codec: AudioCodec
  bitrate: number   // kbps
  volume: number    // gain multiplier: 0 = mute, 1 = 100%, 2 = 200%
  speed: number     // 0.5 - 2x
  pitch: number     // semitones: -12 to +12
  trackIndex: number | null // which audio stream (null = muted / video-only)
}

export const VIDEO_FORMATS = [
  'avi',
  'flv',
  'gif',
  'mkv',
  'mov',
  'mp4',
  'ogv',
  'webm',
] as const

export const AUDIO_FORMATS = [
  'flac',
  'mp3',
  'ogg',
  'wav',
] as const

type VideoFormat = (typeof VIDEO_FORMATS)[number]
type AudioFormat = (typeof AUDIO_FORMATS)[number]
export type MediaFormat = VideoFormat | AudioFormat

/** output container format. "source" means keep the input format. */
export type OutputFormat = 'source' | MediaFormat

export const OUTPUT_FORMATS = [...VIDEO_FORMATS, ...AUDIO_FORMATS] as const satisfies readonly Exclude<OutputFormat, 'source'>[]

/** which tab in the command center is active. */
export type CommandCenterTab = 'video' | 'audio' | 'console'

/* ffmpeg engine lifecycle */

export type FFmpegStatus = 'idle' | 'loading' | 'ready' | 'error'

/** stages of the file ingestion pipeline. */
export type IngestionStatus =
  | 'idle'
  | 'writing'       // uploading file to wasm fs
  | 'probing'       // running ffmpeg -i
  | 'preview'       // trying native playback or transcoding
  | 'ready'         // everything done
  | 'error'

/* supported formats and limits */

export const SUPPORTED_VIDEO_EXTENSIONS = VIDEO_FORMATS.map((format) => `.${format}`)
export const SUPPORTED_AUDIO_EXTENSIONS = AUDIO_FORMATS.map((format) => `.${format}`)
export const SUPPORTED_EXTENSIONS = [...SUPPORTED_VIDEO_EXTENSIONS, ...SUPPORTED_AUDIO_EXTENSIONS]

/** hard max for wasm + ffmpeg memory constraints. */
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 // 2 GiB

/** recommended limit for smooth operation on most machines. */
export const RECOMMENDED_FILE_SIZE = 500 * 1024 * 1024 // 500 mb
