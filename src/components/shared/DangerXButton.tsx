import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import * as Icons from './Icons'

interface DangerXButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string
}

export const DangerXButton = forwardRef<HTMLButtonElement, DangerXButtonProps>(function DangerXButton(
  { label, className, type = 'button', title, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`btn btn-danger shrink-0 ${className ?? ''}`.trim()}
      aria-label={label}
      title={title ?? label}
      {...props}
    >
      <Icons.X width={12} height={12} strokeWidth={2} />
    </button>
  )
})
