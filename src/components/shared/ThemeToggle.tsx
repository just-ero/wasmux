/**
 * themetoggle.tsx - text button to switch between themes.
 *
 * shows a sun icon when in dark mode ("click for light") and a
 * moon icon when in light mode ("click for dark"). has an
 * aria-label describing the action, and advertises the t hotkey
 * via aria-keyshortcuts and a tooltip.
 *
 * the button is intentionally minimal: a bordered square with
 * the icon. no text - the icon + tooltip + aria-label are enough.
 */

import type { Theme } from '../../hooks/useTheme'
import * as Icons from './Icons'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === 'dark'
  return (
    <button
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-keyshortcuts="t"
      title="Theme (T)"
      className="btn"
    >
      {isDark ? <Icons.Sun width={19} height={19} strokeWidth={1.9} /> : <Icons.Moon width={18} height={18} strokeWidth={1.8} />}
    </button>
  )
}
