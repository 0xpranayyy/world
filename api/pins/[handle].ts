import { normalizeHandle, readPins } from '../_lib/store.js'

export async function GET(request: Request): Promise<Response> {
  const handle = normalizeHandle(new URL(request.url).pathname.split('/').pop() ?? '')
  const pin = (await readPins()).find((item) => item.handle === handle) ?? null
  if (!pin) {
    return Response.json(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  return Response.json(pin, { headers: { 'Cache-Control': 'no-store' } })
}
