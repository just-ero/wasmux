/**
 * snap.ts - shared snap-to-target helper.
 *
 * given a current value and a target, returns the target if the
 * value is within `zone` units of it, otherwise returns the value
 * unchanged.
 */

export function snap(value: number, target: number, zone: number): number {
  return Math.abs(value - target) < zone ? target : value
}
