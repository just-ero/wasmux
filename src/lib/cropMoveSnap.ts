import type { CropRegion } from '@/types/editor'

export type MoveSnapModeX = 'center' | 'left' | 'right' | null
export type MoveSnapModeY = 'center' | 'top' | 'bottom' | null

export interface MoveSnapLock {
  x: number
  y: number
}

export interface ResolveMoveSnapInput {
  orig: CropRegion
  sourceW: number
  sourceH: number
  centerX: number
  centerY: number
  snapZoneX: number
  snapZoneY: number
  dx: number
  dy: number
  constrainAspect: boolean
  quantizedDx: number
  quantizedDy: number
  prevLock: MoveSnapLock | null
}

export interface ResolveMoveSnapOutput {
  x: number
  y: number
  snappedXGuide: boolean
  snappedYGuide: boolean
  nextLock: MoveSnapLock | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function pickXMode(probeX: number, width: number, centerX: number, snapZoneX: number): MoveSnapModeX {
  const probeCenterX = probeX + width / 2
  const probeLeftX = probeX
  const probeRightX = probeX + width

  const candidates: Array<{ mode: Exclude<MoveSnapModeX, null>; dist: number }> = [
    { mode: 'center', dist: Math.abs(probeCenterX - centerX) / Math.max(1, snapZoneX) },
    { mode: 'left', dist: Math.abs(probeLeftX - centerX) / Math.max(1, snapZoneX) },
    { mode: 'right', dist: Math.abs(probeRightX - centerX) / Math.max(1, snapZoneX) },
  ]

  let best: { mode: Exclude<MoveSnapModeX, null>; dist: number } | null = null
  for (const candidate of candidates) {
    if (candidate.dist > 1) continue
    if (!best || candidate.dist < best.dist) best = candidate
  }

  return best?.mode ?? null
}

function pickYMode(probeY: number, height: number, centerY: number, snapZoneY: number): MoveSnapModeY {
  const probeCenterY = probeY + height / 2
  const probeTopY = probeY
  const probeBottomY = probeY + height

  const candidates: Array<{ mode: Exclude<MoveSnapModeY, null>; dist: number }> = [
    { mode: 'center', dist: Math.abs(probeCenterY - centerY) / Math.max(1, snapZoneY) },
    { mode: 'top', dist: Math.abs(probeTopY - centerY) / Math.max(1, snapZoneY) },
    { mode: 'bottom', dist: Math.abs(probeBottomY - centerY) / Math.max(1, snapZoneY) },
  ]

  let best: { mode: Exclude<MoveSnapModeY, null>; dist: number } | null = null
  for (const candidate of candidates) {
    if (candidate.dist > 1) continue
    if (!best || candidate.dist < best.dist) best = candidate
  }

  return best?.mode ?? null
}

function applySnapX(mode: MoveSnapModeX, centerX: number, width: number, fallbackX: number): number {
  if (mode === 'center') return centerX - width / 2
  if (mode === 'left') return centerX
  if (mode === 'right') return centerX - width
  return fallbackX
}

function applySnapY(mode: MoveSnapModeY, centerY: number, height: number, fallbackY: number): number {
  if (mode === 'center') return centerY - height / 2
  if (mode === 'top') return centerY
  if (mode === 'bottom') return centerY - height
  return fallbackY
}

export function resolveMoveSnap(input: ResolveMoveSnapInput): ResolveMoveSnapOutput {
  const {
    orig,
    sourceW,
    sourceH,
    centerX,
    centerY,
    snapZoneX,
    snapZoneY,
    dx,
    dy,
    constrainAspect,
    quantizedDx,
    quantizedDy,
    prevLock,
  } = input

  const moveDx = constrainAspect ? quantizedDx : dx
  const moveDy = constrainAspect ? quantizedDy : dy

  const baseX = clamp(orig.x + moveDx, 0, sourceW - orig.width)
  const baseY = clamp(orig.y + moveDy, 0, sourceH - orig.height)
  const snapXMode = pickXMode(baseX, orig.width, centerX, snapZoneX)
  const snapYMode = pickYMode(baseY, orig.height, centerY, snapZoneY)

  if (constrainAspect) {
    const onDiagonal = Math.abs(quantizedDx) > 1e-6 && Math.abs(quantizedDy) > 1e-6
    const inSnapRegion = !onDiagonal && (snapXMode !== null || snapYMode !== null)

    if (!inSnapRegion) {
      return {
        x: baseX,
        y: baseY,
        snappedXGuide: false,
        snappedYGuide: false,
        nextLock: null,
      }
    }

    const nextX = clamp(
      applySnapX(snapXMode, centerX, orig.width, prevLock?.x ?? baseX),
      0,
      sourceW - orig.width,
    )
    const nextY = clamp(
      applySnapY(snapYMode, centerY, orig.height, prevLock?.y ?? baseY),
      0,
      sourceH - orig.height,
    )

    return {
      x: nextX,
      y: nextY,
      snappedXGuide: snapXMode !== null,
      snappedYGuide: snapYMode !== null,
      nextLock: { x: nextX, y: nextY },
    }
  }

  const x = clamp(applySnapX(snapXMode, centerX, orig.width, baseX), 0, sourceW - orig.width)
  const y = clamp(applySnapY(snapYMode, centerY, orig.height, baseY), 0, sourceH - orig.height)

  return {
    x,
    y,
    snappedXGuide: snapXMode !== null,
    snappedYGuide: snapYMode !== null,
    nextLock: null,
  }
}
