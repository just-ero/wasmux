// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LogPanel } from '@/components/shared/LogPanel'
import { useLogStore } from '@/stores/logStore'
import { useEditorStore } from '@/stores/editorStore'
import type { LogEntry } from '@/stores/logStore'

function runningEntry(): LogEntry {
  return {
    id: 'export-1',
    label: 'exporting (re-encoding)',
    status: 'running',
    progress: 13,
    children: [
      {
        id: 'export-1:encode',
        label: 'encode media (re-encoding)',
        status: 'running',
        progress: 13,
        children: [],
      },
    ],
  }
}

describe('LogPanel header job summary', () => {
  beforeEach(() => {
    useLogStore.setState({
      entries: [runningEntry()],
      panelHeight: 28,
      collapsedIds: new Set(),
    })
    useEditorStore.setState({ activeTab: 'console' })
  })

  it('shows active job summary in header when panel is closed', () => {
    render(<LogPanel />)
    expect(screen.getByRole('tab', { name: /encode media.*13%/i })).toBeTruthy()
  })

  it('shows active job summary in header when panel is open but console is not focused', () => {
    useLogStore.setState({ panelHeight: 240 })
    useEditorStore.setState({ activeTab: 'video' })

    render(<LogPanel />)
    expect(screen.getByRole('tab', { name: /encode media.*13%/i })).toBeTruthy()
  })

  it('shows plain log label when console is focused', () => {
    useLogStore.setState({ panelHeight: 240 })
    useEditorStore.setState({ activeTab: 'console' })

    render(<LogPanel />)
    expect(screen.getByRole('tab', { name: /^log$/i })).toBeTruthy()
  })

  it('does not auto-open when active tab is video while panel is collapsed', () => {
    useLogStore.setState({ panelHeight: 28 })
    useEditorStore.setState({ activeTab: 'video' })

    render(<LogPanel />)

    expect(useLogStore.getState().panelHeight).toBe(28)
  })
})
