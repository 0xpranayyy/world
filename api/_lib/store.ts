import { createClient } from '@supabase/supabase-js'
import { seedPins } from './seed.js'

export type Pin = {
  id: string
  handle: string
  locationName: string
  lat: number
  lng: number
  joinedAt: string
}

type PinRow = {
  id: string
  handle: string
  location_name: string
  lat: number
  lng: number
  joined_at: string
}

const MAX_PINS = 5000
const MAX_HANDLE_LENGTH = 32
const MAX_LOCATION_LENGTH = 120

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

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

export function isPin(value: unknown): value is Pin {
  return coercePin(value) != null
}

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase()
}

function rowToPin(row: PinRow): Pin {
  return {
    id: row.id,
    handle: row.handle,
    locationName: row.location_name,
    lat: row.lat,
    lng: row.lng,
    joinedAt: row.joined_at,
  }
}

async function seedIfEmpty(): Promise<void> {
  const { count, error } = await supabase.from('pins').select('*', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  if ((count ?? 0) > 0) return

  const seed = seedPins
    .map(coercePin)
    .filter((pin): pin is Pin => pin != null)
    .map((pin) => ({
      id: pin.id,
      handle: pin.handle,
      location_name: pin.locationName,
      lat: pin.lat,
      lng: pin.lng,
      joined_at: pin.joinedAt,
    }))
  // Ignore duplicates: a concurrent request may have seeded first.
  await supabase.from('pins').upsert(seed, { onConflict: 'handle', ignoreDuplicates: true })
}

export async function readPins(): Promise<Pin[]> {
  await seedIfEmpty()
  const { data, error } = await supabase.from('pins').select('*').order('joined_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as PinRow[]).map(rowToPin)
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

  // Soft cap: like the Blob-based version before it, this count check isn't
  // perfectly atomic under extreme concurrent bursts right at the boundary
  // (a handful of pins could land past MAX_PINS in that rare case). The
  // property that actually matters -- no duplicate or lost pins -- is
  // guaranteed by the database's unique constraint on handle below, which
  // *is* fully atomic.
  const { count, error: countError } = await supabase.from('pins').select('*', { count: 'exact', head: true })
  if (countError) throw new Error(countError.message)
  if ((count ?? 0) >= MAX_PINS) {
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

  const { error } = await supabase.from('pins').insert({
    id: pin.id,
    handle: pin.handle,
    location_name: pin.locationName,
    lat: pin.lat,
    lng: pin.lng,
    joined_at: pin.joinedAt,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: 'already on the globe', status: 409, handle }
    }
    throw new Error(error.message)
  }

  return { pin }
}

export async function deletePin(handle: string): Promise<boolean> {
  const normalized = normalizeHandle(handle)
  const { data, error } = await supabase.from('pins').delete().eq('handle', normalized).select('id')
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}
