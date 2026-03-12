import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * top-level error boundary.
 * catches unhandled render errors so the user gets a recovery
 * option instead of a blank white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center min-h-dvh bg-bg">
          <div className="text-center max-w-md px-6">
            <h1 className="text-error text-lg">Something went wrong</h1>
            <p className="text-text-muted mt-2">{this.state.error.message}</p>
            <button
              onClick={() => location.reload()}
              className="btn mt-4 px-4 py-2"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
