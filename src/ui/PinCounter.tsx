import { cityKey } from '../geo'
import { relativeTime } from '../lib/time'
import type { Pin } from '../types'

export function PinCounter({ pins }: { pins: Pin[] }) {
  const cities = new Set(pins.map((p) => cityKey(p.locationName))).size
  const last = pins.reduce<Pin | null>((best, pin) => {
    if (!best) return pin
    return Date.parse(pin.joinedAt) > Date.parse(best.joinedAt) ? pin : best
  }, null)

  return (
    <div className="counter">
      <span className="counter-number">{pins.length.toLocaleString()}</span>
      <span className="counter-label">pins</span>
      <p className="legend">
        {cities} {cities === 1 ? 'city' : 'cities'}
        {last ? ` · last join ${relativeTime(last.joinedAt)}` : ''}
      </p>
    </div>
  )
}
