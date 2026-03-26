import { describe, it, expect, beforeEach } from 'vitest'
import { useLogStore } from '@/stores/logStore'
import type { LogEntry } from '@/stores/logStore'

/* helpers */
function entry(id: string, overrides?: Partial<LogEntry>): LogEntry {
  return { id, label: id, status: 'pending', progress: 0, children: [], ...overrides }
}

function reset() {
  useLogStore.setState({ entries: [], panelHeight: 28, collapsedIds: new Set() })
}

/* tests */
beforeEach(reset)

async function flushOutputBatch(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

describe('addEntry', () => {
  it('appends a root-level entry', () => {
    useLogStore.getState().addEntry(entry('a'))
    useLogStore.getState().addEntry(entry('b'))
    expect(useLogStore.getState().entries.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('starts new entries collapsed by default', () => {
    useLogStore.getState().addEntry(entry('a'))
    expect(useLogStore.getState().collapsedIds.has('a')).toBe(true)
  })
})

describe('updateEntry', () => {
  it('patches a root-level entry', () => {
    useLogStore.getState().addEntry(entry('a'))
    useLogStore.getState().updateEntry('a', { status: 'done', progress: 100 })
    const a = useLogStore.getState().entries[0]
    expect(a.status).toBe('done')
    expect(a.progress).toBe(100)
  })

  it('patches a deeply nested entry', () => {
    useLogStore.getState().addEntry(entry('root'))
    useLogStore.getState().addChild('root', entry('child'))
    useLogStore.getState().addChild('child', entry('grandchild'))
    useLogStore.getState().updateEntry('grandchild', { status: 'running', progress: 42 })

    const gc = useLogStore.getState().entries[0].children[0].children[0]
    expect(gc.status).toBe('running')
    expect(gc.progress).toBe(42)
  })

  it('does not mutate entries it does not match', () => {
    useLogStore.getState().addEntry(entry('a'))
    useLogStore.getState().addEntry(entry('b'))
    useLogStore.getState().updateEntry('b', { status: 'error' })
    expect(useLogStore.getState().entries[0].status).toBe('pending')
  })
})

describe('addChild', () => {
  it('appends a child under the correct parent', () => {
    useLogStore.getState().addEntry(entry('root'))
    useLogStore.getState().addChild('root', entry('child-1'))
    useLogStore.getState().addChild('root', entry('child-2'))

    const kids = useLogStore.getState().entries[0].children
    expect(kids.map((c) => c.id)).toEqual(['child-1', 'child-2'])
    expect(useLogStore.getState().collapsedIds.has('root')).toBe(false)
  })

  it('appends a child under a nested parent', () => {
    useLogStore.getState().addEntry(entry('root'))
    useLogStore.getState().addChild('root', entry('child'))
    useLogStore.getState().addChild('child', entry('grandchild'))

    const gc = useLogStore.getState().entries[0].children[0].children
    expect(gc.map((c) => c.id)).toEqual(['grandchild'])
  })

  it('starts new child entries collapsed by default', () => {
    useLogStore.getState().addEntry(entry('root'))
    useLogStore.getState().addChild('root', entry('child'))

    expect(useLogStore.getState().collapsedIds.has('child')).toBe(true)
    expect(useLogStore.getState().collapsedIds.has('root')).toBe(false)
  })
})

describe('setPanelHeight', () => {
  it('sets panel height', () => {
    expect(useLogStore.getState().panelHeight).toBe(28)
    useLogStore.getState().setPanelHeight(200)
    expect(useLogStore.getState().panelHeight).toBe(200)
  })
})

describe('appendOutput', () => {
  it('appends output lines to a root entry', async () => {
    useLogStore.getState().addEntry(entry('a'))
    useLogStore.getState().appendOutput('a', 'line 1')
    useLogStore.getState().appendOutput('a', 'line 2')
    await flushOutputBatch()
    expect(useLogStore.getState().entries[0].outputLines).toEqual([
      { type: 'info', message: 'line 1' },
      { type: 'info', message: 'line 2' },
    ])
  })

  it('appends output lines to a nested entry', async () => {
    useLogStore.getState().addEntry(entry('root'))
    useLogStore.getState().addChild('root', entry('child'))
    useLogStore.getState().appendOutput('child', 'hello', 'stdout')
    await flushOutputBatch()
    expect(useLogStore.getState().entries[0].children[0].outputLines).toEqual([{ type: 'stdout', message: 'hello' }])
  })

  it('initializes outputLines if undefined', async () => {
    useLogStore.getState().addEntry(entry('a'))
    expect(useLogStore.getState().entries[0].outputLines).toBeUndefined()
    useLogStore.getState().appendOutput('a', 'first', 'stderr')
    await flushOutputBatch()
    expect(useLogStore.getState().entries[0].outputLines).toEqual([{ type: 'stderr', message: 'first' }])
  })

  it('caps output at MAX_OUTPUT_LINES (5000)', async () => {
    useLogStore.getState().addEntry(entry('a'))
    for (let i = 0; i < 5010; i++) {
      useLogStore.getState().appendOutput('a', `line-${i}`)
    }
    await flushOutputBatch()
    const lines = useLogStore.getState().entries[0].outputLines!
    expect(lines).toHaveLength(5000)
    expect(lines[0].message).toBe('line-10')    // oldest 10 were trimmed
    expect(lines[4999].message).toBe('line-5009')
  })
})
