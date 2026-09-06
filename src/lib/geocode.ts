import type { GeoSuggestion } from '../types'

export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<GeoSuggestion | null> {
  const url = new URL('/api/geocode/reverse', window.location.origin)
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lng', String(lng))
  const res = await fetch(url, { signal })
  if (!res.ok) return null
  const hit = (await res.json()) as GeoSuggestion | null
  return hit
}
