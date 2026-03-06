export type OutputChannel = 'stdout' | 'stderr' | 'info'

export interface OutputEvent {
  channel: OutputChannel
  message: string
  rawType?: string
}

export type OutputSubscriber = (event: OutputEvent) => void

export interface OutputSource {
  subscribe: (subscriber: OutputSubscriber) => () => void
}
