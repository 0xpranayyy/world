import { BlobError, list, put } from '@vercel/blob'
import { seedPins } from './seed.js'

export type Pin = {
  id: string
  handle: string
  locationName: string
  lat: number
  lng: number
  joinedAt: string
}

const PIN_PREFIX = 'pins/'
const AGGREGATE_PATH = 'world-pins.json'
const MAX_PINS = 5000
const MAX_HANDLE_LENGTH = 32
const MAX_LOCATION_LENGTH = 120

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

function pinPath(handle: string): string {
  return `${PIN_PREFIX}${encodeURIComponent(handle)}.json`
}

function strongEtag(etag: string): string {
  return etag.replace(/^W\//, '')
}

function isAlreadyExists(err: unknown): boolean {
  return err instanceof BlobError && /already exists/i.test(err.message)
}

// Each pin is its own blob, created with allowOverwrite:false. That gives a
// real atomic "create if not exists" guarantee (verified: of 6 truly
// concurrent writers to the same pathname, exactly 1 succeeds and the rest
// are cleanly rejected) which a single shared JSON blob does not: put()'s
// ifMatch precondition was observed to let multiple concurrent writers pass
// the check and silently clobber each other's data. Per-pin blobs are the
// durable source of truth; the aggregate blob below is only a read cache
// that self-heals whenever it's found to be out of sync.
async function listPinBlobs(): Promise<{ pathname: string; url: string }[]> {
  const all: { pathname: string; url: string }[] = []
  let cursor: string | undefined
  for (let page = 0; page < 10; page += 1) {
    const result = await list({ prefix: PIN_PREFIX, limit: 1000, cursor })
    all.push(...result.blobs.map((blob) => ({ pathname: blob.pathname, url: blob.url })))
    if (!result.hasMore) break
    cursor = result.cursor
  }
  return all
}

async function fetchPin(url: string): Promise<Pin | null> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return null
  const parsed: unknown = await res.json()
  return coercePin(parsed)
}

async function readAllPinsFromSource(): Promise<Pin[]> {
  const blobs = await listPinBlobs()
  const pins = await Promise.all(blobs.map((blob) => fetchPin(blob.url)))
  return pins.filter((pin): pin is Pin => pin != null)
}

async function readAggregate(): Promise<{ pins: Pin[]; etag: string } | null> {
  const { blobs } = await list({ prefix: AGGREGATE_PATH, limit: 8 })
  const found = blobs.find((blob) => blob.pathname === AGGREGATE_PATH)
  if (!found) return null
  const res = await fetch(found.url, { cache: 'no-store' })
  if (!res.ok) return null
  const parsed: unknown = await res.json()
  const pins = Array.isArray(parsed) ? parsed.map(coercePin).filter((pin): pin is Pin => pin != null) : []
  return { pins, etag: strongEtag(found.etag) }
}

async function writeAggregate(pins: Pin[]): Promise<void> {
  try {
    await put(AGGREGATE_PATH, JSON.stringify(pins), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
      allowOverwrite: true,
    })
  } catch {
    /* the aggregate is only a cache; per-pin blobs remain authoritative */
  }
}

async function putPinIfAbsent(pin: Pin): Promise<void> {
  await put(pinPath(pin.handle), JSON.stringify(pin), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
    allowOverwrite: false,
  }).catch((err) => {
    if (!isAlreadyExists(err)) throw err
  })
}

function handleFromPinPathname(pathname: string): string {
  return decodeURIComponent(pathname.slice(PIN_PREFIX.length, -'.json'.length))
}

// A genuinely fresh store (nothing under pins/ yet) gets seeded from the
// hardcoded seed list. Per-pin blobs are the sole source of truth once
// created, so this only ever needs to run once per store.
async function seedIfEmpty(): Promise<void> {
  const existing = await listPinBlobs()
  if (existing.length > 0) return
  const seed = seedPins.map(coercePin).filter((pin): pin is Pin => pin != null)
  await Promise.all(seed.map((pin) => putPinIfAbsent(pin)))
}

export async function readPins(): Promise<Pin[]> {
  await seedIfEmpty()
  const blobs = await listPinBlobs()
  const trueHandles = new Set(blobs.map((blob) => handleFromPinPathname(blob.pathname)))

  const aggregate = await readAggregate()
  if (aggregate) {
    const aggHandles = new Set(aggregate.pins.map((pin) => pin.handle))
    const inSync =
      aggHandles.size === trueHandles.size && [...trueHandles].every((handle) => aggHandles.has(handle))
    if (inSync) return aggregate.pins
  }

  const pins = await readAllPinsFromSource()
  await writeAggregate(pins)
  return pins
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
  if (handle.length > MAX_HANDLE_LENGTH || draft.locationName.trim().length > MAX_LOCATION_LENGTH) {
    return { error: 'handle or location too long', status: 400 }
  }
  if (!Number.isFinite(draft.lat) || !Number.isFinite(draft.lng)) {
    return { error: 'lat lng required', status: 400 }
  }

  await seedIfEmpty()
  const existingCount = (await listPinBlobs()).length
  if (existingCount >= MAX_PINS) {
    return { error: 'the globe is full', status: 507 }
  }

  const pin: Pin = {
    id: crypto.randomUUID(),
    handle,
    locationName: draft.locationName.trim(),
    lat: clampLat(draft.lat),
    lng: wrapLng(draft.lng),
    joinedAt: new Date().toISOString(),
  }

  try {
    await put(pinPath(handle), JSON.stringify(pin), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
      allowOverwrite: false,
    })
  } catch (err) {
    if (isAlreadyExists(err)) return { error: 'already on the globe', status: 409, handle }
    throw err
  }

  // Don't eagerly rebuild the aggregate here: listPinBlobs() reflects writes
  // immediately (unlike get()), so the next readPins() call will detect the
  // mismatch and rebuild it lazily. Doing it here too would mean every write
  // pays the full O(pin count) re-fetch, which gets expensive under bursts
  // of concurrent submissions -- the lazy path already amortizes that cost
  // across whichever single read happens to trigger the rebuild.
  return { pin }
}
