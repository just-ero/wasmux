/** modal showing keyboard shortcuts. */

import { useEffect, useRef } from 'react'
import { HOTKEY_HELP, HOTKEYS, matchesHotkey } from '../../lib/hotkeys'
import { DangerXButton } from './DangerXButton'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function KeyboardHelp({ isOpen, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)

    const handler = (e: KeyboardEvent) => {
      if (matchesHotkey(e.key, HOTKEYS.help)) {
        e.preventDefault()
        onClose()
      } else if (matchesHotkey(e.key, HOTKEYS.closeDialog)) {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Tab') {
        const dialogEl = dialogRef.current
        if (!dialogEl) return

        const focusables = Array.from(
          dialogEl.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0)

        if (focusables.length === 0) {
          e.preventDefault()
          return
        }

        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement

        if (e.shiftKey) {
          if (active === first || !dialogEl.contains(active)) {
            e.preventDefault()
            last.focus()
          }
        } else if (active === last || !dialogEl.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handler)
      previouslyFocusedRef.current?.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-help-title"
        className="bg-bg-raised rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-bg-raised border-b border-border p-4 flex items-center justify-between">
          <h2 id="keyboard-help-title" className="text-lg font-semibold">Keyboard Shortcuts</h2>
          <DangerXButton ref={closeButtonRef} label="Close (Esc)" onClick={onClose} />
        </div>

        <div className="p-6 space-y-6">
          {HOTKEY_HELP.map((section) => (
            <section key={section.title}>
              <h3 className="text-sm font-semibold text-accent mb-3">{section.title}</h3>
              <div className="space-y-2 text-sm">
                {section.entries.map((entry) => (
                  <div key={`${section.title}-${entry.description}`} className="flex justify-between gap-4">
                    <span>
                      {entry.keys.map((key, index) => (
                        <span key={`${entry.description}-${key}`}>
                          {index > 0 ? ' / ' : ''}
                          <kbd>{key}</kbd>
                        </span>
                      ))}
                    </span>
                    <span className="text-text-muted text-right">{entry.description}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <p className="text-[12px] text-text-muted">
            <strong>Tip:</strong> Click the video to focus it before using keyboard shortcuts.
          </p>
        </div>
      </div>
    </div>
  )
}
