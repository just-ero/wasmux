import { snap } from '@/lib/snap'

export type HorizontalAnchor = 'left' | 'center' | 'right'
export type VerticalAnchor = 'top' | 'center' | 'bottom'

export function snapHorizontalPosition(
  x: number,
  width: number,
  axis: number,
  zone: number,
  anchors: HorizontalAnchor[],
): { x: number; snapped: boolean } {
  for (const anchor of anchors) {
    const value = anchor === 'left' ? x : anchor === 'center' ? x + width / 2 : x + width
    const snappedValue = snap(value, axis, zone)
    if (snappedValue === axis) {
      const snappedX = anchor === 'left' ? axis : anchor === 'center' ? axis - width / 2 : axis - width
      return { x: snappedX, snapped: true }
    }
  }

  return { x, snapped: false }
}

export function snapVerticalPosition(
  y: number,
  height: number,
  axis: number,
  zone: number,
  anchors: VerticalAnchor[],
): { y: number; snapped: boolean } {
  for (const anchor of anchors) {
    const value = anchor === 'top' ? y : anchor === 'center' ? y + height / 2 : y + height
    const snappedValue = snap(value, axis, zone)
    if (snappedValue === axis) {
      const snappedY = anchor === 'top' ? axis : anchor === 'center' ? axis - height / 2 : axis - height
      return { y: snappedY, snapped: true }
    }
  }

  return { y, snapped: false }
}
