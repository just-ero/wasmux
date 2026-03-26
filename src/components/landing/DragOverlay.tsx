/** full-window overlay shown while dragging files. */

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
        <span className="text-accent">
          <em>drop file</em>
        </span>
      </div>
    </div>
  )
}
