import { normalizeHandle, readPins } from '../_lib/store'

export async function GET(
  _request: Request,
  context: { params: Promise<{ handle: string }> | { handle: string } },
): Promise<Response> {
  const params = await Promise.resolve(context.params)
  const handle = normalizeHandle(params.handle ?? '')
  const pin = (await readPins()).find((item) => item.handle === handle) ?? null
  if (!pin) {
    return Response.json(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  return Response.json(pin, { headers: { 'Cache-Control': 'no-store' } })
}
