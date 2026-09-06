import { formatCoords, shortLocation } from '../geo'
import { pinUrl } from '../lib/routes'
import type { Pin } from '../types'

function mapSrc(lat: number, lng: number): string {
  const pad = 0.45
  const minLng = lng - pad
  const minLat = lat - pad * 0.62
  const maxLng = lng + pad
  const maxLat = lat + pad * 0.62
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`
  const params = new URLSearchParams({
    bbox,
    layer: 'mapnik',
    marker: `${lat},${lng}`,
  })
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`
}

export function PinCard({
  pin,
  onClose,
  onShare,
}: {
  pin: Pin
  onClose: () => void
  onShare: () => void
}) {
  const joined = new Date(pin.joinedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const city = shortLocation(pin.locationName)

  return (
    <aside className="pin-card" role="dialog" aria-labelledby="pin-card-handle">
      <div className="pin-card-head">
        <div>
          <h2 id="pin-card-handle">@{pin.handle}</h2>
          <p className="secondary">{city}</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="close card">
          close
        </button>
      </div>
      <div className="pin-map">
        <iframe
          title={`map of ${city}`}
          src={mapSrc(pin.lat, pin.lng)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <p className="pin-place">{pin.locationName}</p>
      <p className="tertiary">
        {formatCoords(pin.lat, pin.lng)} · joined {joined}
      </p>
      <button type="button" className="drop" onClick={onShare}>
        share card
      </button>
      <button
        type="button"
        className="text-link"
        onClick={() => void navigator.clipboard.writeText(pinUrl(pin.handle))}
      >
        copy link
      </button>
    </aside>
  )
}
