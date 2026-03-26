import type { OutputChannel } from '@/core/output/types'

export function normalizeOutputChannel(rawType: string | undefined): OutputChannel {
  const t = (rawType ?? '').toLowerCase()

  if (t === 'stdout' || t === 'out' || t === 'ffout') return 'stdout'
  if (t === 'stderr' || t === 'err' || t === 'fferr') return 'stderr'

  return 'info'
}

/**
 * generic error-line detector for command output.
 * this is intentionally command-agnostic so any runner can reuse it.
 */
export function isErrorOutputLine(message: string): boolean {
  return /(\berror\b|\bfatal\b|\bfailed\b|\binvalid\b|\bdenied\b|\bunable\b|\baborted\b|\bpanic\b)/i.test(message)
}
