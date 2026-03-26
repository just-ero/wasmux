/** theme toggle button. */

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
