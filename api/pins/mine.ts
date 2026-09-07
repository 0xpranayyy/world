import { checkRateLimit } from '../_lib/rateLimit.js'
import { deletePinByToken } from '../_lib/store.js'

const noStore = { 'Cache-Control': 'no-store' }

// Lets whoever holds a pin's private edit token (issued once at creation
// time, in POST /api/pins's response) remove that pin themselves, without
// needing the admin token.
export async function DELETE(request: Request): Promise<Response> {
  const rate = await checkRateLimit(request, { key: 'self-delete', limit: 10, windowMs: 60 * 1000 })
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
  const token = typeof (body as Record<string, unknown> | null)?.token === 'string'
    ? (body as { token: string }).token
    : ''
  if (!token) {
    return Response.json({ error: 'edit token required' }, { status: 400, headers: noStore })
  }

  try {
    const removed = await deletePinByToken(token)
    if (!removed) {
      return Response.json({ error: 'no matching pin' }, { status: 404, headers: noStore })
    }
    return Response.json({ removed }, { headers: noStore })
  } catch (err) {
    console.error('DELETE /api/pins/mine failed:', err)
    return Response.json({ error: 'delete failed' }, { status: 503, headers: noStore })
  }
}
