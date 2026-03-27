/** minimal landing view with file entry actions. */

import { useState } from 'react'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { KeyboardHelp } from '@/components/shared/KeyboardHelp'
import { InfoPanel } from '@/components/shared/InfoPanel'
import * as Icons from '@/components/shared/Icons'
import { AUDIO_FORMATS, VIDEO_FORMATS } from '@/types/editor'
import type { Theme } from '@/hooks/useTheme'

interface LandingPageProps {
  theme: Theme
  onToggleTheme: () => void
  onBrowse: () => void
  /** file validation error from app. */
  error: string | null
}

const REPO_URL = import.meta.env.VITE_REPO_URL ?? 'https://github.com/just-ero/wasmux'
const APP_VERSION = __APP_VERSION__
const LANDING_LINK_STYLE = 'text-accent font-semibold italic hover:underline decoration-[1.5px] underline-offset-2'

export function LandingPage({ theme, onToggleTheme, onBrowse, error }: LandingPageProps) {
  const [helpOpen, setHelpOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

  return (
    <>
      <header
        className="flex items-center bg-bg-raised border-b border-border shrink-0 min-h-[36px]"
        style={{ padding: 'var(--wasmux-edge-space)', gap: 'calc(var(--wasmux-edge-space) * 2)' }}
      >
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className={`text-sm select-none ${LANDING_LINK_STYLE}`}
          onClick={(e) => e.stopPropagation()}
        >
          wasmux <span className="text-text-muted">v{APP_VERSION}</span>
        </a>

        <div className="flex items-center text-text-muted ml-auto shrink-0" style={{ gap: 'calc(var(--wasmux-edge-space) * 1.5)' }}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setInfoOpen(true)
            }}
            className="btn shrink-0"
            aria-label="Info panel"
            title="Info panel"
          >
            <Icons.UiInfo />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setHelpOpen(true)
            }}
            className="btn shrink-0"
            aria-label="Keyboard shortcuts (press ?)"
            title="Keyboard shortcuts"
          >
            <Icons.Keyboard width={18} height={18} strokeWidth={1.7} />
          </button>
          <div onClick={(e) => e.stopPropagation()}>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>
      </header>

      <section className="flex-1 w-full flex items-center justify-center">
        <div className="w-[min(760px,100%)]" style={{ padding: 'var(--wasmux-edge-space)' }}>
          <div className="flex flex-col items-center" style={{ gap: 'calc(var(--wasmux-edge-space) * 2)' }}>
            <p className="text-center text-[1.05rem] sm:text-[1.15rem]">
              drop, paste, or{' '}
              <span
                role="button"
                tabIndex={0}
                className={`${LANDING_LINK_STYLE} cursor-pointer`}
                onClick={onBrowse}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onBrowse()
                  }
                }}
              >
                browse
              </span>{' '}
              a file{' '}
              <span className="text-text-muted">(max. 2 gb)</span>
            </p>

            <div className="flex flex-col items-center text-center text-[12px] text-text-muted select-text cursor-text" style={{ gap: 'calc(var(--wasmux-edge-space) / 2)' }}>
              <div>{VIDEO_FORMATS.map((format) => `.${format}`).join(' ')}</div>
              <div>{AUDIO_FORMATS.map((format) => `.${format}`).join(' ')}</div>
              <div className="flex items-center justify-center gap-1 mt-2 text-text-muted">
                <Icons.UiInfo width={12} height={12} />
                <span className="text-[11px]">all processing happens locally in your browser. no data is ever uploaded to any server.</span>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-error flex items-center mt-1 rounded border border-error/50" style={{ gap: 'calc(var(--wasmux-edge-space) / 2)', paddingInline: 'calc(var(--wasmux-edge-space) * 1.5)', paddingBlock: 'calc(var(--wasmux-edge-space) * 0.75)' }}>
                <Icons.AlertCircle width={16} height={16} />
                {error}
              </p>
            )}
          </div>
        </div>
      </section>

      <KeyboardHelp isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <InfoPanel isOpen={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  )
}
