/**
 * top bar of the editor view.
 *
 * shows: filename, help, theme toggle, close button.
 */

import { useEditorStore } from '@/stores/editorStore'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import type { Theme } from '@/hooks/useTheme'
import * as Icons from '@/components/shared/Icons'

interface Props {
  onClose: () => void
  theme: Theme
  onToggleTheme: () => void
  onShowHelp: () => void
  onShowInfo: () => void
}

export function EditorHeader({ onClose, theme, onToggleTheme, onShowHelp, onShowInfo }: Props) {
  const file = useEditorStore((s) => s.file)

  if (!file) return null

  return (
    <header
      className="flex items-center bg-bg-raised border-b border-border shrink-0 min-h-[36px]"
      style={{ padding: 'var(--wasmux-edge-space)', gap: 'calc(var(--wasmux-edge-space) * 2)' }}
    >
      {/* close / back button */}
      <button
        onClick={onClose}
        className="btn shrink-0"
        aria-label="Close editor"
        title="Back"
      >
        <Icons.Chevron width={16} height={16} />
      </button>

      {/* filename */}
      <span className="truncate" title={file.name}>
        {file.name}
      </span>

      <div className="flex items-center text-text-muted ml-auto shrink-0" style={{ gap: 'calc(var(--wasmux-edge-space) * 1.5)' }}>
        <button
          onClick={onShowInfo}
          className="btn shrink-0"
          aria-label="info panel"
          title="info panel"
        >
          <Icons.UiInfo />
        </button>
        <button
          onClick={onShowHelp}
          className="btn shrink-0"
          aria-label="Keyboard shortcuts (press ?)"
          title="Keyboard shortcuts"
        >
          <Icons.Keyboard width={18} height={18} strokeWidth={1.7} />
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  )
}
