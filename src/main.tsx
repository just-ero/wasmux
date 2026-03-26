/** app entry point. */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/tailwind.css'
import '@/styles/main.sass'
import { App } from '@/App'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
