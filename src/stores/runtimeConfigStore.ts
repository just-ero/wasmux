import { create } from 'zustand'
import YAML from 'yaml'

interface CropSnapConfig {
  minPixels: number
  widthFactor: number
  heightFactor: number
}

interface RuntimeConfigState {
  cropSnap: CropSnapConfig
  loaded: boolean
  loadRuntimeConfig: () => Promise<void>
}

const DEFAULT_CROP_SNAP: CropSnapConfig = {
  minPixels: 4,
  widthFactor: 0.006,
  heightFactor: 0.006,
}

function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return value
}

function parseCropSnapConfig(raw: unknown): CropSnapConfig {
  const root = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const crop = (root.crop && typeof root.crop === 'object') ? root.crop as Record<string, unknown> : {}
  const snap = (crop.snap && typeof crop.snap === 'object') ? crop.snap as Record<string, unknown> : {}

  const minPixels = Math.max(1, coerceNumber(snap.minPixels, DEFAULT_CROP_SNAP.minPixels))
  const widthFactor = Math.max(0.0001, coerceNumber(snap.widthFactor, DEFAULT_CROP_SNAP.widthFactor))
  const heightFactor = Math.max(0.0001, coerceNumber(snap.heightFactor, DEFAULT_CROP_SNAP.heightFactor))

  return { minPixels, widthFactor, heightFactor }
}

export const useRuntimeConfigStore = create<RuntimeConfigState>((set, get) => ({
  cropSnap: DEFAULT_CROP_SNAP,
  loaded: false,
  loadRuntimeConfig: async () => {
    if (get().loaded) return

    const base = import.meta.env.BASE_URL ?? '/'
    const normalizedBase = base.endsWith('/') ? base : `${base}/`
    const url = `${normalizedBase}wasmux.config.yaml`

    try {
      const response = await fetch(url)
      if (!response.ok) {
        set({ loaded: true })
        return
      }

      const text = await response.text()
      const parsed = YAML.parse(text)
      set({
        cropSnap: parseCropSnapConfig(parsed),
        loaded: true,
      })
    } catch {
      set({ loaded: true })
    }
  },
}))
