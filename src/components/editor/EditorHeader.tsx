/**
 * top bar of the editor view.
 *
 * shows: filename, help, theme toggle, close button.
 */

import { useEditorStore } from '../../stores/editorStore'
import { ThemeToggle } from '../shared/ThemeToggle'
import type { Theme } from '../../hooks/useTheme'
import * as Icons from '../shared/Icons'

interface Props {
  onClose: () => void
  theme: Theme
  onToggleTheme: () => void
  onShowHelp: () => void
}

export function EditorHeader({ onClose, theme, onToggleTheme, onShowHelp }: Props) {
  const file = useEditorStore((s) => s.file)

  if (!file) return null

  return (
    <header className="flex items-center gap-4 px-3 py-1.5 bg-bg-raised border-b border-border shrink-0 min-h-[36px]">
      {/* close / back button */}
      <button
        onClick={onClose}
        className="btn shrink-0"
        aria-label="Close editor"
        title="Back"
      >
        <Icons.ChevronLeft width={16} height={16} />
      </button>

      {/* filename */}
      <span className="truncate" title={file.name}>
        {file.name}
      </span>

      <div className="flex items-center gap-3 text-text-muted ml-auto shrink-0">
        <button
          onClick={onShowHelp}
          className="btn shrink-0"
          aria-label="Keyboard shortcuts (press ?)"
          title="Keyboard shortcuts"
        >
          <Icons.UiInfo />
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  )
}
