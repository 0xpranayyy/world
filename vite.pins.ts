import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

type Pin = {
  id: string
  handle: string
  locationName: string
  lat: number
  lng: number
  joinedAt: string
}

const root = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(root, '.data')
const backupFile = path.join(dataDir, 'pins.backup.json')
const dataFile = path.join(dataDir, 'pins.json')
const seedFile = path.join(root, 'src/data/seedPins.json')

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

function readPins(): Pin[] {
  fs.mkdirSync(dataDir, { recursive: true })
  if (!fs.existsSync(dataFile)) {
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8')) as unknown
    const pins = Array.isArray(seed) ? seed.filter(isPin) : []
    writePins(pins)
    return pins
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    if (!Array.isArray(parsed)) {
      return readBackup() ?? []
    }
    const pins = parsed.filter(isPin)
    return pins.length > 0 ? pins : (readBackup() ?? pins)
  } catch {
    return readBackup() ?? []
  }
}

function readBackup(): Pin[] | null {
  if (!fs.existsSync(backupFile)) return null
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(backupFile, 'utf8'))
    if (!Array.isArray(parsed)) return null
    const pins = parsed.filter(isPin)
    return pins.length > 0 ? pins : null
  } catch {
    return null
  }
}

function writePins(pins: Pin[]): void {
  fs.mkdirSync(dataDir, { recursive: true })
  const current = fs.existsSync(dataFile)
    ? (() => {
        try {
          const parsed: unknown = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
          return Array.isArray(parsed) ? parsed.filter(isPin) : []
        } catch {
          return []
        }
      })()
    : []
  const byHandle = new Map(current.map((pin) => [pin.handle, pin]))
  for (const pin of pins) {
    if (!byHandle.has(pin.handle)) byHandle.set(pin.handle, pin)
    else byHandle.set(pin.handle, pin)
  }
  const next = [...byHandle.values()]
  if (next.length < current.length) return
  const body = JSON.stringify(next, null, 2)
  fs.writeFileSync(dataFile, body)
  fs.writeFileSync(backupFile, body)
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (!url.pathname.startsWith('/api/pins')) return false

  if (req.method === 'GET' && url.pathname === '/api/pins') {
    send(res, 200, readPins())
    return true
  }

  const one = url.pathname.match(/^\/api\/pins\/([^/]+)$/)
  if (req.method === 'GET' && one) {
    const handle = decodeURIComponent(one[1]).replace(/^@/, '').toLowerCase()
    const pin = readPins().find((p) => p.handle === handle) ?? null
    send(res, pin ? 200 : 404, pin)
    return true
  }

  if (req.method === 'POST' && url.pathname === '/api/pins') {
    const raw = await readBody(req)
    let draft: unknown
    try {
      draft = JSON.parse(raw)
    } catch {
      send(res, 400, { error: 'invalid json' })
      return true
    }
    if (typeof draft !== 'object' || draft === null) {
      send(res, 400, { error: 'invalid pin' })
      return true
    }
    const d = draft as Record<string, unknown>
    const handle =
      typeof d.handle === 'string' ? d.handle.trim().replace(/^@+/, '').toLowerCase() : ''
    if (!handle || typeof d.locationName !== 'string') {
      send(res, 400, { error: 'handle and location required' })
      return true
    }
    if (typeof d.lat !== 'number' || typeof d.lng !== 'number') {
      send(res, 400, { error: 'lat lng required' })
      return true
    }
    const pins = readPins()
    if (pins.some((p) => p.handle === handle)) {
      send(res, 409, { error: `already on the globe`, handle })
      return true
    }
    if (pins.length >= 5000) {
      send(res, 507, { error: 'the globe is full' })
      return true
    }
    const pin: Pin = {
      id: crypto.randomUUID(),
      handle,
      locationName: d.locationName.trim(),
      lat: d.lat,
      lng: d.lng,
      joinedAt: new Date().toISOString(),
    }
    writePins([...pins, pin])
    send(res, 201, pin)
    return true
  }

  send(res, 405, { error: 'method not allowed' })
  return true
}

export function pinsApi(): Plugin {
  return {
    name: 'world-pins-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApi(req, res).then((hit) => {
          if (!hit) next()
        })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApi(req, res).then((hit) => {
          if (!hit) next()
        })
      })
    },
  }
}
