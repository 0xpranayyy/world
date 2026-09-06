import { list, put } from '@vercel/blob'
import { seedPins } from './seed.js'

export type Pin = {
  id: string
  handle: string
  locationName: string
  lat: number
  lng: number
  joinedAt: string
}

const PATH = 'world-pins.json'
const MAX_PINS = 5000

export function isPin(value: unknown): value is Pin {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.handle === 'string' &&
    typeof v.locationName === 'string' &&
    typeof v.lat === 'number' &&
    typeof v.lng === 'number' &&
    typeof v.joinedAt === 'string'
  )
}

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase()
}

async function writePins(pins: Pin[]): Promise<void> {
  await put(PATH, JSON.stringify(pins), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  })
}

export async function readPins(): Promise<Pin[]> {
  const { blobs } = await list({ prefix: PATH, limit: 8 })
  const found = blobs.find((blob) => blob.pathname === PATH)
  if (!found) {
    const seed = seedPins.filter(isPin)
    await writePins(seed)
    return seed
  }
  const res = await fetch(found.url, { cache: 'no-store' })
  if (!res.ok) return seedPins.filter(isPin)
  const parsed: unknown = await res.json()
  return Array.isArray(parsed) ? parsed.filter(isPin) : seedPins.filter(isPin)
}

export async function addPin(draft: {
  handle: string
  locationName: string
  lat: number
  lng: number
}): Promise<{ pin: Pin } | { error: string; status: number; handle?: string }> {
  const handle = normalizeHandle(draft.handle)
  if (!handle || !draft.locationName.trim()) {
    return { error: 'handle and location required', status: 400 }
  }
  if (!Number.isFinite(draft.lat) || !Number.isFinite(draft.lng)) {
    return { error: 'lat lng required', status: 400 }
  }
  const pins = await readPins()
  if (pins.some((pin) => pin.handle === handle)) {
    return { error: 'already on the globe', status: 409, handle }
  }
  if (pins.length >= MAX_PINS) {
    return { error: 'the globe is full', status: 507 }
  }
  const pin: Pin = {
    id: crypto.randomUUID(),
    handle,
    locationName: draft.locationName.trim(),
    lat: draft.lat,
    lng: draft.lng,
    joinedAt: new Date().toISOString(),
  }
  await writePins([...pins, pin])
  return { pin }
}
