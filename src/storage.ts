import { CHANNEL, MY_HANDLE_KEY, STORAGE_KEY } from './constants'
import seedPinsJson from './data/seedPins.json'
import { normalizeHandle } from './geo'
import type { Pin, PinDraft } from './types'

export class DuplicateHandleError extends Error {
  constructor(handle: string) {
    super(`@${handle} is already on the globe`)
    this.name = 'DuplicateHandleError'
  }
}

export class RateLimitedError extends Error {
  constructor() {
    super('too many pins from this address, try again later')
    this.name = 'RateLimitedError'
  }
}

export class SignInRequiredError extends Error {
  constructor() {
    super('sign in with Google to drop a pin')
    this.name = 'SignInRequiredError'
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
  if (!raw) return seedPins.slice()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return seedPins.slice()
    const pins = parsed.filter(isPin)
    return pins.length > 0 ? pins : seedPins.slice()
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
      if (res.status === 429) throw new RateLimitedError()
      if (res.status === 401) throw new SignInRequiredError()
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof DuplicateHandleError || err instanceof RateLimitedError || err instanceof SignInRequiredError) {
      throw err
    }
    return null
  }
}

export async function listPins(): Promise<Pin[]> {
  const remote = await fromApi<Pin[]>('/api/pins')
  if (remote) {
    // Trust the server fully once it responds. Keeping local-only entries
    // around "in case the server just doesn't know about them yet" made
    // sense before writes were made reliable -- now it only creates ghost
    // pins that outlive their removal from the server (verified: a pin that
    // was briefly live and then deleted server-side kept reappearing in this
    // client's own view indefinitely, since it was never dropped from cache).
    writeLocal(remote)
    return remote
  }
  return readLocal()
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
    credentials: 'include',
  })
  if (remote && isPin(remote)) {
    const byHandle = new Map(readLocal().map((p) => [p.handle, p]))
    byHandle.set(remote.handle, remote)
    const pins = [...byHandle.values()]
    writeLocal(pins)
    broadcast(pins)
    rememberMe(handle)
    return remote
  }

  throw new Error('could not save pin to the globe')
}

// Moves the caller's own pin to a new location instead of deleting and
// re-dropping it. Ownership is proven by the signed-in Google session cookie.
export async function moveMyPin(location: { locationName: string; lat: number; lng: number }): Promise<Pin> {
  const remote = await fromApi<Pin>('/api/pins/mine', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(location),
    credentials: 'include',
  })
  if (remote && isPin(remote)) return remote
  throw new Error('could not move pin')
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
