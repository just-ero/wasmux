/**
 * usetheme.ts - theme state management.
 *
 * manages the light / dark theme toggle. on first load it reads
 * from localstorage (key "wasmux-theme"). if nothing is stored,
 * it falls back to the os preference via `prefers-color-scheme`.
 *
 * when the theme changes:
 *   1. `data-theme` attribute on <html> is updated (css reads it)
 *   2. value is persisted to localstorage
 *
 * the initial theme is also set by an inline <script> in index.html
 * (before react mounts) to avoid a flash of the wrong theme.
 *
 * the app treats theme choice as explicit and persistent, so once
 * initialized we only update theme from user actions.
 */

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'wasmux-theme'

/** read the initial theme: localstorage → os preference → light. */
function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  /** apply the theme to the dom and persist it. */
  const apply = useCallback((t: Theme) => {
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem(STORAGE_KEY, t)
  }, [])

  // sync <html data-theme> whenever the react state changes.
  useEffect(() => {
    apply(theme)
  }, [theme, apply])

  /** toggle between light ↔ dark and persist. */
  const toggle = useCallback(() => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'))
  }, [])

  return { theme, toggle } as const
}
