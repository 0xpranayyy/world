import { checkRateLimit } from '../_lib/rateLimit.js'
import { readSession } from '../_lib/session.js'
import { deletePin } from '../_lib/store.js'

const noStore = { 'Cache-Control': 'no-store' }

// Lets a signed-in user remove their own pin. The handle comes from their
// verified X session, never from the request body, so this can only ever
// delete the pin belonging to whoever is actually signed in.
export async function DELETE(request: Request): Promise<Response> {
  const session = await readSession(request)
  if (!session) {
    return Response.json({ error: 'sign in with X first' }, { status: 401, headers: noStore })
  }

  const rate = await checkRateLimit(request, { key: 'self-delete', limit: 10, windowMs: 60 * 1000 })
  if (!rate.allowed) {
    return Response.json(
      { error: 'too many requests' },
      { status: 429, headers: { ...noStore, 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  try {
    const removed = await deletePin(session.handle)
    if (!removed) {
      return Response.json({ error: 'no pin to remove' }, { status: 404, headers: noStore })
    }
    return Response.json({ removed: session.handle }, { headers: noStore })
  } catch (err) {
    console.error('DELETE /api/pins/mine failed:', err)
    return Response.json({ error: 'delete failed' }, { status: 503, headers: noStore })
  }
}
