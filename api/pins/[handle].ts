import { normalizeHandle, readPins } from '../_lib/store.js'

export async function GET(request: Request): Promise<Response> {
  try {
    const raw = new URL(request.url).pathname.split('/').pop() ?? ''
    const handle = normalizeHandle(decodeURIComponent(raw))
    const pin = (await readPins()).find((item) => item.handle === handle) ?? null
    if (!pin) {
      return Response.json(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }
    return Response.json(pin, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'pins unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
