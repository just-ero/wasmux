import { useEffect, useRef, useState } from 'react'
import type { OutputFormat } from '../../types/editor'

interface FormatOption {
  format: OutputFormat
  label: string
}

interface Props {
  options: FormatOption[]
  anchorRef: React.RefObject<HTMLElement | null>
  menuId: string
  onSelect: (format: OutputFormat) => void
  onClose: () => void
}

export function FormatMenu({ options, anchorRef, menuId, onSelect, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    setActiveIndex(0)
    const focusTimer = window.setTimeout(() => {
      itemRefs.current[0]?.focus()
    }, 0)

    return () => {
      window.clearTimeout(focusTimer)
      anchorRef.current?.focus()
    }
  }, [anchorRef])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [anchorRef, onClose])

  useEffect(() => {
    const menu = menuRef.current
    const anchor = anchorRef.current
    if (!menu || !anchor) return

    const anchorRect = anchor.getBoundingClientRect()
    const menuHeight = menu.offsetHeight
    const gap = 4
    const spaceBelow = window.innerHeight - anchorRect.bottom - gap
    const fitsBelow = spaceBelow >= menuHeight

    if (fitsBelow) {
      menu.style.top = `${anchorRect.bottom + gap}px`
      menu.style.bottom = ''
    } else {
      menu.style.top = ''
      menu.style.bottom = `${window.innerHeight - anchorRect.top + gap}px`
    }
    menu.style.right = `${document.documentElement.clientWidth - anchorRect.right}px`
  }, [anchorRef])

  return (
    <div
      id={menuId}
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
      className="format-menu"
      style={{ position: 'fixed', zIndex: 9999 }}
      onKeyDown={(e) => {
        if (options.length === 0) return

        const last = options.length - 1
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onClose()
          return
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault()
          const next = activeIndex >= last ? 0 : activeIndex + 1
          setActiveIndex(next)
          itemRefs.current[next]?.focus()
          return
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault()
          const next = activeIndex <= 0 ? last : activeIndex - 1
          setActiveIndex(next)
          itemRefs.current[next]?.focus()
          return
        }

        if (e.key === 'Home') {
          e.preventDefault()
          setActiveIndex(0)
          itemRefs.current[0]?.focus()
          return
        }

        if (e.key === 'End') {
          e.preventDefault()
          setActiveIndex(last)
          itemRefs.current[last]?.focus()
          return
        }

        if (e.key === 'Tab') {
          e.preventDefault()
          onClose()
          return
        }

        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          const option = options[activeIndex]
          if (option) onSelect(option.format)
        }
      }}
    >
      {options.map(({ format, label }, index) => (
        <button
          key={format}
          ref={(el) => { itemRefs.current[index] = el }}
          role="menuitem"
          className="format-menu-item"
          tabIndex={index === activeIndex ? 0 : -1}
          onFocus={() => setActiveIndex(index)}
          onClick={() => onSelect(format)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
