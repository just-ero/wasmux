/** minimal landing view with file entry actions. */

import { ThemeToggle } from '@/components/shared/ThemeToggle'
import * as Icons from '@/components/shared/Icons'
import { AUDIO_FORMATS, VIDEO_FORMATS } from '@/types/editor'
import type { Theme } from '@/hooks/useTheme'

interface LandingPageProps {
  theme: Theme
  onToggleTheme: () => void
  /** file validation error from app. */
  error: string | null
}

const REPO_URL = import.meta.env.VITE_REPO_URL ?? 'https://github.com/just-ero/wasmux'
const APP_VERSION = __APP_VERSION__
const LANDING_LINK_STYLE = 'text-accent font-semibold italic hover:underline decoration-[1.5px] underline-offset-2'

export function LandingPage({ theme, onToggleTheme, error }: LandingPageProps) {
  return (
    <>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className={`fixed z-10 text-sm select-none ${LANDING_LINK_STYLE}`}
        style={{ top: 'var(--wasmux-edge-space)', left: 'var(--wasmux-edge-space)' }}
        onClick={(e) => e.stopPropagation()}
      >
        wasmux <span className="text-text-muted">v{APP_VERSION}</span>
      </a>

      {/* keep toggle click from triggering main browse action. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="fixed z-10"
        style={{ top: 'var(--wasmux-edge-space)', right: 'var(--wasmux-edge-space)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      {/* parent main handles click-to-browse. */}
      <section className="w-[min(760px,100%)]" style={{ padding: 'var(--wasmux-edge-space)' }}>
        <div className="flex flex-col items-center" style={{ gap: 'calc(var(--wasmux-edge-space) * 2)' }}>
          <p className="text-center text-[1.05rem] sm:text-[1.15rem]">
            drop, paste, or{' '}
            <span className={`${LANDING_LINK_STYLE} cursor-pointer`}>browse</span> a file{' '}
            <span className="text-text-muted">(max. 2 gb)</span>
          </p>

          <div className="flex flex-col items-center text-center text-[12px] text-text-muted select-text cursor-text" style={{ gap: 'calc(var(--wasmux-edge-space) / 2)' }}>
            <div>{VIDEO_FORMATS.map((format) => `.${format}`).join(' ')}</div>
            <div>{AUDIO_FORMATS.map((format) => `.${format}`).join(' ')}</div>
          </div>

          {error && (
            <p role="alert" className="text-error flex items-center mt-1 rounded border border-error/50" style={{ gap: 'calc(var(--wasmux-edge-space) / 2)', paddingInline: 'calc(var(--wasmux-edge-space) * 1.5)', paddingBlock: 'calc(var(--wasmux-edge-space) * 0.75)' }}>
              <Icons.AlertCircle width={16} height={16} />
              {error}
            </p>
          )}
        </div>
      </section>

      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="fixed left-1/2 z-10 -translate-x-1/2 text-sm text-text-muted underline decoration-[1.5px] underline-offset-2 hover:text-text"
        style={{ bottom: 'var(--wasmux-edge-space)' }}
        onClick={(e) => e.stopPropagation()}
      >
        repo
      </a>
    </>
  )
}
