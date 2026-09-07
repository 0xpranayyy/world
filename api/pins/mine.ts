import { checkRateLimit } from '../_lib/rateLimit.js'
import { readSession } from '../_lib/session.js'
import { deletePinByGoogleSub, deletePinByToken } from '../_lib/store.js'

const noStore = { 'Cache-Control': 'no-store' }

// Removes the caller's own pin. A signed-in Google session is the normal
// path; a legacy edit token (from pins created before Google sign-in
// existed) is accepted as a fallback since those pins have no Google
// account on file to match against.
export async function DELETE(request: Request): Promise<Response> {
  const rate = await checkRateLimit(request, { key: 'self-delete', limit: 10, windowMs: 60 * 1000 })
  if (!rate.allowed) {
    return Response.json(
      { error: 'too many requests' },
      { status: 429, headers: { ...noStore, 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  const session = await readSession(request)
  if (session) {
    try {
      const removed = await deletePinByGoogleSub(session.sub)
      if (removed) return Response.json({ removed }, { headers: noStore })
    } catch (err) {
      console.error('DELETE /api/pins/mine (session) failed:', err)
      return Response.json({ error: 'delete failed' }, { status: 503, headers: noStore })
    }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const token = typeof (body as Record<string, unknown> | null)?.token === 'string'
    ? (body as { token: string }).token
    : ''
  if (!token) {
    return Response.json({ error: 'no matching pin' }, { status: 404, headers: noStore })
  }

  try {
    const removed = await deletePinByToken(token)
    if (!removed) {
      return Response.json({ error: 'no matching pin' }, { status: 404, headers: noStore })
    }
    return Response.json({ removed }, { headers: noStore })
  } catch (err) {
    console.error('DELETE /api/pins/mine (token) failed:', err)
    return Response.json({ error: 'delete failed' }, { status: 503, headers: noStore })
  }
}
