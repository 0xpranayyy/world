import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { reverseGeocodePlace, searchPlaces } from './api/_lib/geocode.ts'

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function handleGeocode(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (req.method === 'GET' && url.pathname === '/api/geocode/search') {
    const query = url.searchParams.get('q')?.trim() ?? ''
    if (query.length < 2) {
      send(res, 200, [])
      return true
    }
    try {
      send(res, 200, await searchPlaces(query))
    } catch {
      send(res, 503, { error: 'search unavailable' })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/api/geocode/reverse') {
    const lat = Number(url.searchParams.get('lat'))
    const lng = Number(url.searchParams.get('lng'))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      send(res, 400, { error: 'lat and lng required' })
      return true
    }
    try {
      send(res, 200, await reverseGeocodePlace(lat, lng))
    } catch {
      send(res, 503, { error: 'reverse geocode unavailable' })
    }
    return true
  }

  return false
}

export function geocodeApi(): Plugin {
  return {
    name: 'world-geocode-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleGeocode(req, res).then((hit) => {
          if (!hit) next()
        })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleGeocode(req, res).then((hit) => {
          if (!hit) next()
        })
      })
    },
  }
}
