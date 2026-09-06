import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  put,
} from '@vercel/blob'
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
const BACKUP_PATH = 'world-pins.backup.json'
const MAX_PINS = 5000
const PUT_OPTS = {
  access: 'public' as const,
  addRandomSuffix: false,
  contentType: 'application/json',
  cacheControlMaxAge: 60,
}

export function isPin(value: unknown): value is Pin {
  return coercePin(value) != null
}

function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

function clampLat(lat: number): number {
  return Math.min(90, Math.max(-90, lat))
}

export function coercePin(value: unknown): Pin | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const lat = typeof v.lat === 'number' ? v.lat : Number(v.lat)
  const lng = typeof v.lng === 'number' ? v.lng : Number(v.lng)
  if (
    typeof v.id !== 'string' ||
    typeof v.handle !== 'string' ||
    typeof v.locationName !== 'string' ||
    typeof v.joinedAt !== 'string' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null
  }
  return {
    id: v.id,
    handle: v.handle,
    locationName: v.locationName,
    lat: clampLat(lat),
    lng: wrapLng(lng),
    joinedAt: v.joinedAt,
  }
}

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase()
}

function unionPins(base: Pin[], extra: Pin[]): Pin[] {
  const byHandle = new Map(base.map((pin) => [pin.handle, pin]))
  for (const pin of extra) {
    if (!byHandle.has(pin.handle)) byHandle.set(pin.handle, pin)
  }
  return [...byHandle.values()]
}

async function streamToPins(stream: ReadableStream<Uint8Array>): Promise<Pin[]> {
  const text = await new Response(stream).text()
  const parsed: unknown = JSON.parse(text)
  if (!Array.isArray(parsed)) throw new Error('pins blob is not an array')
  return parsed.map(coercePin).filter((pin): pin is Pin => pin != null)
}

async function readBlob(pathname: string): Promise<{ pins: Pin[]; etag: string } | null> {
  const result = await get(pathname, { access: 'public', useCache: false })
  if (!result || result.statusCode !== 200 || !result.stream) return null
  const pins = await streamToPins(result.stream)
  return { pins, etag: result.blob.etag }
}

async function persist(pins: Pin[], etag: string | null): Promise<void> {
  const body = JSON.stringify(pins)
  await put(PATH, body, {
    ...PUT_OPTS,
    allowOverwrite: etag != null,
    ifMatch: etag ?? undefined,
  })
  try {
    await put(BACKUP_PATH, body, {
      ...PUT_OPTS,
      allowOverwrite: true,
    })
  } catch {
    /* backup is best-effort */
  }
}

async function loadSnapshot(): Promise<{ pins: Pin[]; etag: string | null }> {
  try {
    const primary = await readBlob(PATH)
    if (primary) {
      if (primary.pins.length === 0) {
        const backup = await readBlob(BACKUP_PATH)
        if (backup && backup.pins.length > 0) {
          return { pins: backup.pins, etag: primary.etag }
        }
      }
      return primary
    }
  } catch (err) {
    if (!(err instanceof BlobNotFoundError)) {
      const backup = await readBlob(BACKUP_PATH).catch(() => null)
      if (backup && backup.pins.length > 0) return { pins: backup.pins, etag: null }
      throw err
    }
  }

  const backup = await readBlob(BACKUP_PATH).catch(() => null)
  if (backup && backup.pins.length > 0) {
    return { pins: backup.pins, etag: null }
  }

  const seed = seedPins.map(coercePin).filter((pin): pin is Pin => pin != null)
  try {
    await persist(seed, null)
  } catch (err) {
    if (err instanceof BlobPreconditionFailedError) {
      const raced = await readBlob(PATH)
      if (raced) return raced
    }
    throw err
  }
  const created = await readBlob(PATH)
  return created ?? { pins: seed, etag: null }
}

export async function readPins(): Promise<Pin[]> {
  const snapshot = await loadSnapshot()
  return snapshot.pins
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

  const pin: Pin = {
    id: crypto.randomUUID(),
    handle,
    locationName: draft.locationName.trim(),
    lat: clampLat(draft.lat),
    lng: wrapLng(draft.lng),
    joinedAt: new Date().toISOString(),
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const snapshot = await loadSnapshot()
    if (snapshot.pins.some((item) => item.handle === handle)) {
      return { error: 'already on the globe', status: 409, handle }
    }
    if (snapshot.pins.length >= MAX_PINS) {
      return { error: 'the globe is full', status: 507 }
    }
    const next = unionPins(snapshot.pins, [pin])
    if (next.length < snapshot.pins.length) {
      return { error: 'refusing to shrink the globe', status: 500 }
    }
    try {
      await persist(next, snapshot.etag)
      return { pin }
    } catch (err) {
      if (err instanceof BlobPreconditionFailedError) continue
      throw err
    }
  }

  return { error: 'could not save pin, try again', status: 503 }
}
