export interface HotkeyEntry {
  keys: string[]
  match: string[]
  description: string
}

export interface HotkeySection {
  title: string
  entries: HotkeyEntry[]
}

export const HOTKEYS = {
  playPause: [' '],
  prevFrame: [','],
  nextFrame: ['.'],
  skipBack: ['ArrowLeft'],
  skipForward: ['ArrowRight'],
  setIn: ['[', 'i', 'I'],
  setOut: [']', 'o', 'O'],
  clearSelection: ['x', 'X'],
  theme: ['t', 'T'],
  help: ['?'],
  closeDialog: ['Escape'],
  createCrop: ['c', 'C'],
  export: ['e', 'E'],
} as const

export const HOTKEY_HELP: HotkeySection[] = [
  {
    title: 'Playback',
    entries: [
      { keys: ['Space'], match: [...HOTKEYS.playPause], description: 'Play / Pause' },
      { keys: [',', '.'], match: [...HOTKEYS.prevFrame, ...HOTKEYS.nextFrame], description: 'Previous / Next frame' },
      { keys: ['←', '→'], match: [...HOTKEYS.skipBack, ...HOTKEYS.skipForward], description: 'Skip ±5 seconds' },
    ],
  },
  {
    title: 'Trim Selection',
    entries: [
      { keys: ['[', 'I'], match: [...HOTKEYS.setIn], description: 'Set start selection at current frame' },
      { keys: [']', 'O'], match: [...HOTKEYS.setOut], description: 'Set end selection at current frame' },
      { keys: ['X'], match: [...HOTKEYS.clearSelection], description: 'Clear selection' },
    ],
  },
  {
    title: 'Crop / Pan',
    entries: [
      { keys: ['Drag on video'], match: [], description: 'Draw or adjust crop region' },
      { keys: ['C'], match: [...HOTKEYS.createCrop], description: 'Create default crop at center' },
      { keys: ['↑', '↓', '←', '→'], match: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], description: 'Move crop by 10px' },
      { keys: ['Shift + arrows'], match: ['Shift+ArrowUp', 'Shift+ArrowDown', 'Shift+ArrowLeft', 'Shift+ArrowRight'], description: 'Resize crop by 10px' },
      { keys: ['Esc'], match: ['Escape'], description: 'Clear crop region' },
    ],
  },
  {
    title: 'UI & Navigation',
    entries: [
      { keys: ['Tab'], match: ['Tab'], description: 'Navigate between controls' },
      { keys: ['T'], match: [...HOTKEYS.theme], description: 'Toggle theme' },
      { keys: ['E'], match: [...HOTKEYS.export], description: 'Open export dialog' },
      { keys: ['?'], match: [...HOTKEYS.help], description: 'Open this help dialog' },
      { keys: ['Esc'], match: [...HOTKEYS.closeDialog], description: 'Close menus or dialogs' },
    ],
  },
]

export function matchesHotkey(key: string, candidates: readonly string[]): boolean {
  return candidates.includes(key)
}
