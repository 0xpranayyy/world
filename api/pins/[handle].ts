import { normalizeHandle, readPins } from '../_lib/store.js'

const shortCache = { 'Cache-Control': 'public, max-age=2, stale-while-revalidate=8' }

export async function GET(request: Request): Promise<Response> {
  try {
    const raw = new URL(request.url).pathname.split('/').pop() ?? ''
    const handle = normalizeHandle(decodeURIComponent(raw))
    const pin = (await readPins()).find((item) => item.handle === handle) ?? null
    if (!pin) {
      return Response.json(null, { status: 404, headers: shortCache })
    }
    return Response.json(pin, { headers: shortCache })
  } catch (err) {
    console.error('GET /api/pins/[handle] failed:', err)
    return Response.json({ error: 'pins unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
