/**
 * dragoverlay.tsx - full-window dashed border shown while dragging.
 *
 * this overlay covers the entire viewport with a semi-transparent
 * backdrop and a dashed accent-colour border. it's rendered when
 * `visible` is true (driven by `useglobaldrop`'s `isdragging` state).
 *
 * it sits above all other content (z-50) and is non-interactive
 * (pointer-events-none) so the drop event can bubble through to
 * the window-level handler.
 *
 * the folderopen icon and "drop file" text give the user a clear
 * visual cue that releasing the mouse will accept the file.
 */

import * as Icons from '../shared/Icons'

interface DragOverlayProps {
  visible: boolean
}

export function DragOverlay({ visible }: DragOverlayProps) {
  if (!visible) return null

  return (
    <div
      className="
          fixed inset-0 z-[9999]
        pointer-events-none
        flex items-center justify-center
        bg-bg/60
      "
      aria-hidden
    >
      {/* dashed border inset a bit from the viewport edge */}
      <div
        className="
          absolute inset-4
          border-2 border-dashed border-accent
          rounded-lg
          flex flex-col items-center justify-center gap-3
        "
      >
        <Icons.FolderOpen width={48} height={48} className="text-accent" />
        <span className="text-accent">
          <em>drop file</em>
        </span>
      </div>
    </div>
  )
}
