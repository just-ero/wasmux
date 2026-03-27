/** check whether an event target is a form element (input, textarea, select). */
export function isFormElement(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/**
 * Prevent page/container wheel scrolling while a focused input is being wheeled.
 */
export function lockFocusedInputWheelScroll(input: HTMLInputElement): () => void {
  const onWheel = (event: WheelEvent) => {
    if (document.activeElement === input) {
      event.preventDefault()
    }
  }

  input.addEventListener('wheel', onWheel, { passive: false })
  return () => input.removeEventListener('wheel', onWheel)
}

/**
 * Start playback and swallow expected promise rejections from rapid play/pause toggles.
 */
export function tryPlay(video: HTMLVideoElement): void {
  const maybePromise = video.play()
  if (!maybePromise || typeof maybePromise.catch !== 'function') return
  maybePromise.catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') return
  })
}
