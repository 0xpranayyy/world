import { checkRateLimit } from '../_lib/rateLimit.js'
import { readSession } from '../_lib/session.js'
import { movePinByGoogleSub } from '../_lib/store.js'

const noStore = { 'Cache-Control': 'no-store' }

// Moves the caller's own pin to a new location instead of deleting and
// re-dropping it, which used to be the only way to change where you are --
// with one pin per account, "remove and duplicate" was really just "edit"
// done the hard way. Ownership comes from the signed-in Google session, so
// a caller can only ever move the pin their own account created.
export async function PATCH(request: Request): Promise<Response> {
  const session = await readSession(request)
  if (!session) {
    return Response.json({ error: 'sign in with Google first' }, { status: 401, headers: noStore })
  }

  const rate = await checkRateLimit(request, { key: 'move-pin', limit: 10, windowMs: 60 * 1000 })
  if (!rate.allowed) {
    return Response.json(
      { error: 'too many requests' },
      { status: 429, headers: { ...noStore, 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400, headers: noStore })
  }
  if (typeof body !== 'object' || body === null) {
    return Response.json({ error: 'invalid request' }, { status: 400, headers: noStore })
  }
  const b = body as Record<string, unknown>
  const update = {
    locationName: typeof b.locationName === 'string' ? b.locationName : '',
    lat: typeof b.lat === 'number' ? b.lat : Number(b.lat),
    lng: typeof b.lng === 'number' ? b.lng : Number(b.lng),
  }

  try {
    const result = await movePinByGoogleSub(session.sub, update)
    if ('pin' in result) return Response.json(result.pin, { headers: noStore })
    return Response.json({ error: result.error }, { status: result.status, headers: noStore })
  } catch (err) {
    console.error('PATCH /api/pins/mine failed:', err)
    return Response.json({ error: 'could not move pin' }, { status: 503, headers: noStore })
  }
}
