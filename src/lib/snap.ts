/** snap value to target when inside the given zone. */

export function snap(value: number, target: number, zone: number): number {
  return Math.abs(value - target) < zone ? target : value
}
