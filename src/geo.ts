import { Vector3 } from 'three'

export function latLngToVector3(
  lat: number,
  lng: number,
  radius: number,
  target = new Vector3(),
): Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const y = radius * Math.cos(phi)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  return target.set(x, y, z)
}

export function vector3ToLatLng(v: Vector3): { lat: number; lng: number } {
  const r = Math.hypot(v.x, v.y, v.z) || 1
  const y = v.y / r
  const phi = Math.acos(Math.min(1, Math.max(-1, y)))
  const theta = Math.atan2(v.z, -v.x)
  return {
    lat: 90 - (phi * 180) / Math.PI,
    lng: (theta * 180) / Math.PI - 180,
  }
}

export function sunDirection(date = new Date(), target = new Vector3()): Vector3 {
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const sunLng = 15 * (12 - hours)
  return latLngToVector3(8, sunLng, 1, target)
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 12742 * Math.asin(Math.min(1, Math.sqrt(s)))
}

export function nearbyPins<T extends { lat: number; lng: number; handle: string }>(
  pin: T,
  pins: T[],
  limit = 3,
): T[] {
  return pins
    .filter((p) => p.handle !== pin.handle)
    .map((p) => ({ pin: p, d: haversineKm(pin, p) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.pin)
}

export type PlaceScope = 'city' | 'country' | 'continent'

export function cityKey(locationName: string): string {
  return shortLocation(locationName).toLowerCase()
}

export function cityCount(pins: { locationName: string }[], locationName: string): number {
  const key = cityKey(locationName)
  return pins.filter((p) => cityKey(p.locationName) === key).length
}

export function placeParts(locationName: string): { city: string; country: string } {
  const parts = locationName.split(',').map((s) => s.trim()).filter(Boolean)
  const city = parts[0] ?? locationName
  const country = parts[parts.length - 1] ?? city
  return { city, country }
}

const COUNTRY_CONTINENT: Record<string, string> = {
  'united states': 'North America',
  'united states of america': 'North America',
  canada: 'North America',
  mexico: 'North America',
  brazil: 'South America',
  argentina: 'South America',
  colombia: 'South America',
  chile: 'South America',
  germany: 'Europe',
  france: 'Europe',
  'united kingdom': 'Europe',
  iceland: 'Europe',
  spain: 'Europe',
  italy: 'Europe',
  nigeria: 'Africa',
  kenya: 'Africa',
  egypt: 'Africa',
  'south africa': 'Africa',
  japan: 'Asia',
  china: 'Asia',
  india: 'Asia',
  singapore: 'Asia',
  indonesia: 'Asia',
  australia: 'Oceania',
  'new zealand': 'Oceania',
}

function continentFromLatLng(lat: number, lng: number): string {
  if (lat <= -60) return 'Antarctica'
  if (lat < 20 && lng > 110 && lng <= 180) return 'Oceania'
  if (lat < 0 && lng < -130) return 'Oceania'
  if (lng <= -30 && lng >= -170) return lat >= 12 ? 'North America' : 'South America'
  if (lng >= -32 && lng <= 40 && lat >= 36) return 'Europe'
  if (lng >= -20 && lng <= 52 && lat < 36) return 'Africa'
  return 'Asia'
}

export function continentName(country: string, lat: number, lng: number): string {
  return COUNTRY_CONTINENT[country.toLowerCase()] ?? continentFromLatLng(lat, lng)
}

export function placeLabel(
  pin: { locationName: string; lat: number; lng: number },
  scope: PlaceScope,
): string {
  const { city, country } = placeParts(pin.locationName)
  if (scope === 'city') return city
  if (scope === 'country') return country
  return continentName(country, pin.lat, pin.lng)
}

export function placeCount(
  pins: { locationName: string; lat: number; lng: number }[],
  pin: { locationName: string; lat: number; lng: number },
  scope: PlaceScope,
): number {
  const key = placeLabel(pin, scope).toLowerCase()
  return pins.filter((p) => placeLabel(p, scope).toLowerCase() === key).length
}

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase()
}

export function hashPhase(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) / 4294967295) * Math.PI * 2
}

export function shortLocation(name: string): string {
  return name.split(',')[0]?.trim() || name
}

export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(2)}°${ns}  ${Math.abs(lng).toFixed(2)}°${ew}`
}

export function shortestAngle(from: number, to: number): number {
  let diff = to - from
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return from + diff
}
