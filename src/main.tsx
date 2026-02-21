/**
 * main.tsx - application entry point.
 *
 * creates the react root and mounts <app /> inside <strictmode>.
 *
 * strictmode enables extra development-time warnings:
 *   - double-invoked effects to catch impure side effects
 *   - warnings for deprecated apis
 *   - ref callback verification
 *
 * `./styles/tailwind.css` provides tailwind + @theme token mapping,
 * and `./styles/main.sass` provides maintainable app styles.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tailwind.css'
import './styles/main.sass'
import { App } from './App'
import { ErrorBoundary } from './components/shared/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
