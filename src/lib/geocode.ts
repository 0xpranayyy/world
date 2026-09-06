import type { GeoSuggestion } from '../types'

type NominatimHit = {
  place_id?: number
  display_name: string
  lat: string
  lon: string
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<GeoSuggestion | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('zoom', '10')
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) return null
  const hit = (await res.json()) as NominatimHit
  if (!hit.display_name) return null
  return {
    id: String(hit.place_id ?? `${lat},${lng}`),
    displayName: hit.display_name,
    lat: Number(hit.lat),
    lng: Number(hit.lon),
  }
}
