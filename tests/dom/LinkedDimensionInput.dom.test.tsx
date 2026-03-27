// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LinkedDimensionInput } from '@/components/shared/LinkedDimensionInput'

describe('LinkedDimensionInput wheel scaling', () => {
  it('one downward wheel tick at 1x goes to 0.95x on 1280x720', () => {
    const onWidthChange = vi.fn()
    const onHeightChange = vi.fn()
    const onLinkedChange = vi.fn()

    render(
      <LinkedDimensionInput
        width={1280}
        height={720}
        linked={true}
        sourceAspect={1280 / 720}
        sourceWidth={1280}
        sourceHeight={720}
        onWidthChange={onWidthChange}
        onHeightChange={onHeightChange}
        onLinkedChange={onLinkedChange}
        ariaPrefix="Output"
      />,
    )

    const widthInput = screen.getByLabelText('Output width') as HTMLInputElement
    widthInput.focus()
    fireEvent.wheel(widthInput, { deltaY: 120 })

    expect(onWidthChange).toHaveBeenCalled()
    const [w, linkedH] = onWidthChange.mock.calls.at(-1) as [number | null, number | null]
    expect(w).toBe(1216)
    expect(linkedH).toBe(684)
  })
})
