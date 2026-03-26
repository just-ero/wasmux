import type { ComponentType, SVGProps } from 'react'

import SunSvg from '../../assets/icons/sun.svg?react'
import MoonSvg from '../../assets/icons/moon.svg?react'
import CopySvg from '../../assets/icons/copy.svg?react'
import AlertCircleSvg from '../../assets/icons/alert-circle.svg?react'
import CheckSvg from '../../assets/icons/check.svg?react'
import XSvg from '../../assets/icons/x.svg?react'
import InfoSvg from '../../assets/icons/info.svg?react'
import PlaySvg from '../../assets/icons/play.svg?react'
import PauseSvg from '../../assets/icons/pause.svg?react'
import ChevronSvg from '../../assets/icons/chevron.svg?react'
import ExportSvg from '../../assets/icons/export.svg?react'
import LinkSvg from '../../assets/icons/link.svg?react'
import LinkOffSvg from '../../assets/icons/link-off.svg?react'

type P = SVGProps<SVGSVGElement>

type IconSource = ComponentType<P>

const defaults: P = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function icon(source: IconSource, extra?: Partial<P>) {
  const Source = source
  return function Icon(props: P) {
    return <Source {...defaults} {...extra} {...props} />
  }
}

export const Sun = icon(SunSvg)
export const Moon = icon(MoonSvg)

export const Copy = icon(CopySvg)

export const AlertCircle = icon(AlertCircleSvg)
export const Check = icon(CheckSvg)
export const X = icon(XSvg)

export const Info = icon(InfoSvg)

export function UiInfo(props: P) {
  return <Info width={18} height={18} strokeWidth={1.9} {...props} />
}

export const Play = icon(PlaySvg)
export const Pause = icon(PauseSvg)
export const Chevron = icon(ChevronSvg)

export function StepForward(props: P) {
  return <ChevronSvg {...defaults} {...props} style={{ ...(props.style ?? {}), transform: 'scaleX(-1)' }} />
}

export const ChevronLeft = icon(ChevronSvg)

export const Export = icon(ExportSvg)
export const Link = icon(LinkSvg)
export const LinkOff = icon(LinkOffSvg)
