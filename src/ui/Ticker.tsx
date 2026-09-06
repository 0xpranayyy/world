import { useEffect } from 'react'
import { shortLocation } from '../geo'
import type { Pin } from '../types'

export function Ticker({
  items,
  onGone,
  onSelect,
}: {
  items: Pin[]
  onGone: (id: string) => void
  onSelect: (pin: Pin) => void
}) {
  const latest = items[items.length - 1]
  useEffect(() => {
    if (!latest) return
    const id = window.setTimeout(() => onGone(latest.id), 5200)
    return () => window.clearTimeout(id)
  }, [latest, onGone])

  if (!latest) return null

  return (
    <button type="button" className="ticker" onClick={() => onSelect(latest)}>
      @{latest.handle} just joined from {shortLocation(latest.locationName)}
    </button>
  )
}
