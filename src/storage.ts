import { CHANNEL, MAX_PINS, MY_HANDLE_KEY, STORAGE_KEY } from './constants'
import seedPinsJson from './data/seedPins.json'
import { normalizeHandle } from './geo'
import type { Pin, PinDraft } from './types'

export class DuplicateHandleError extends Error {
  constructor(handle: string) {
    super(`@${handle} is already on the globe`)
    this.name = 'DuplicateHandleError'
  }
}

const seedPins = seedPinsJson as Pin[]

function isPin(value: unknown): value is Pin {
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

function readLocal(): Pin[] {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedPins))
    return seedPins.slice()
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return seedPins.slice()
    return parsed.filter(isPin)
  } catch {
    return seedPins.slice()
  }
}

function writeLocal(pins: Pin[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pins))
}

function broadcast(pins: Pin[]): void {
  try {
    new BroadcastChannel(CHANNEL).postMessage({ type: 'pins', pins })
  } catch {
    /* ignore */
  }
}

async function fromApi<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, init)
    if (!res.ok) {
      if (res.status === 409) {
        const body = (await res.json()) as { handle?: string }
        throw new DuplicateHandleError(body.handle ?? 'unknown')
      }
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof DuplicateHandleError) throw err
    return null
  }
}

export async function listPins(): Promise<Pin[]> {
  const remote = await fromApi<Pin[]>('/api/pins')
  const local = readLocal()
  if (remote) {
    const byHandle = new Map(remote.map((pin) => [pin.handle, pin]))
    for (const pin of local) {
      if (!byHandle.has(pin.handle)) byHandle.set(pin.handle, pin)
    }
    const merged = [...byHandle.values()]
    writeLocal(merged)
    return merged
  }
  return local
}

export async function getPinByHandle(handle: string): Promise<Pin | null> {
  const normalized = normalizeHandle(handle)
  const remote = await fromApi<Pin | null>(`/api/pins/${encodeURIComponent(normalized)}`)
  if (remote && isPin(remote)) return remote
  return readLocal().find((pin) => pin.handle === normalized) ?? null
}

export async function addPin(draft: PinDraft): Promise<Pin> {
  const handle = normalizeHandle(draft.handle)
  if (!handle) throw new Error('handle is required')
  const payload = {
    handle,
    locationName: draft.locationName.trim(),
    lat: draft.lat,
    lng: draft.lng,
  }
  const remote = await fromApi<Pin>('/api/pins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (remote && isPin(remote)) {
    const pins = [...readLocal().filter((p) => p.handle !== remote.handle), remote]
    writeLocal(pins)
    broadcast(pins)
    rememberMe(handle)
    return remote
  }

  const pins = readLocal()
  if (pins.some((pin) => pin.handle === handle)) {
    throw new DuplicateHandleError(handle)
  }
  if (pins.length >= MAX_PINS) throw new Error('the globe is full')
  const pin: Pin = {
    id: crypto.randomUUID(),
    handle,
    locationName: payload.locationName,
    lat: payload.lat,
    lng: payload.lng,
    joinedAt: new Date().toISOString(),
  }
  const next = [...pins, pin]
  writeLocal(next)
  broadcast(next)
  rememberMe(handle)
  return pin
}

export function rememberMe(handle: string): void {
  window.localStorage.setItem(MY_HANDLE_KEY, normalizeHandle(handle))
}

export function myHandle(): string | null {
  return window.localStorage.getItem(MY_HANDLE_KEY)
}

export function subscribePins(onPins: (pins: Pin[]) => void): () => void {
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = (event: MessageEvent<{ type?: string; pins?: Pin[] }>) => {
      if (event.data?.type === 'pins' && Array.isArray(event.data.pins)) {
        onPins(event.data.pins.filter(isPin))
      }
    }
  } catch {
    channel = null
  }
  const poll = window.setInterval(() => {
    void listPins().then(onPins)
  }, 4000)
  return () => {
    window.clearInterval(poll)
    channel?.close()
  }
}
