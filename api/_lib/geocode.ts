export type GeoHit = {
  id: string
  displayName: string
  lat: number
  lng: number
}

type NominatimResult = {
  place_id?: number
  display_name: string
  lat: string
  lon: string
}

// Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
// requires a real identifying User-Agent and expects light, non-bulk use.
// Calling it from every visitor's browser directly (as this app used to)
// can't satisfy either of those and is the first thing likely to break
// under real traffic. Proxying through here lets us set a proper
// User-Agent and add a caching layer in front of it.
const USER_AGENT = 'world-globe (https://world-liart-one.vercel.app)'

function toHit(raw: NominatimResult, fallbackId: string): GeoHit | null {
  const lat = Number(raw.lat)
  const lng = Number(raw.lon)
  if (!raw.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { id: String(raw.place_id ?? fallbackId), displayName: raw.display_name, lat, lng }
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoHit[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '5')
  url.searchParams.set('q', query)
  const res = await fetch(url, { signal, headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
  if (!res.ok) return []
  const hits = (await res.json()) as NominatimResult[]
  return hits
    .slice(0, 5)
    .map((hit, i) => toHit(hit, `${query}-${i}`))
    .filter((hit): hit is GeoHit => hit != null)
}

export async function reverseGeocodePlace(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<GeoHit | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('zoom', '10')
  const res = await fetch(url, { signal, headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
  if (!res.ok) return null
  const hit = (await res.json()) as NominatimResult
  return toHit(hit, `${lat},${lng}`)
}
