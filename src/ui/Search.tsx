import { useMemo, useState } from 'react'
import { shortLocation } from '../geo'
import type { Pin } from '../types'

export function Search({
  pins,
  open,
  onClose,
  onPick,
}: {
  pins: Pin[]
  open: boolean
  onClose: () => void
  onPick: (pin: Pin) => void
}) {
  const [query, setQuery] = useState('')
  const hits = useMemo(() => {
    const q = query.trim().replace(/^@/, '').toLowerCase()
    if (q.length < 1) return []
    return pins
      .filter(
        (p) =>
          p.handle.includes(q) ||
          p.locationName.toLowerCase().includes(q) ||
          shortLocation(p.locationName).toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [pins, query])

  if (!open) return null

  return (
    <div className="search">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && hits[0]) {
            onPick(hits[0])
            setQuery('')
          }
        }}
        placeholder="search @handle or city"
        aria-label="search people and cities"
      />
      {hits.length > 0 ? (
        <ul className="suggestions" role="listbox">
          {hits.map((pin) => (
            <li key={pin.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(pin)
                  setQuery('')
                }}
              >
                @{pin.handle} · {shortLocation(pin.locationName)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
