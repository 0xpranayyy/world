import { checkRateLimit } from '../../_lib/rateLimit.js'
import { deletePin } from '../../_lib/store.js'

const noStore = { 'Cache-Control': 'no-store' }

function isAuthorized(request: Request): boolean {
  const expected = process.env.MODERATION_ADMIN_TOKEN
  if (!expected) return false
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  return token.length > 0 && token === expected
}

// A minimal moderation capability: DELETE /api/admin/pins/<handle> with
// `Authorization: Bearer <MODERATION_ADMIN_TOKEN>` removes a pin. There's no
// admin UI here -- this exists so an abusive handle or location string can
// actually be removed (there was previously no way to do that at all short
// of manually editing Blob storage) without building a full admin panel.
export async function DELETE(request: Request): Promise<Response> {
  const rate = await checkRateLimit(request, { key: 'admin-delete', limit: 20, windowMs: 60 * 1000 })
  if (!rate.allowed) {
    return Response.json(
      { error: 'too many requests' },
      { status: 429, headers: { ...noStore, 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  if (!isAuthorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: noStore })
  }

  const raw = new URL(request.url).pathname.split('/').pop() ?? ''
  const handle = decodeURIComponent(raw)
  if (!handle) {
    return Response.json({ error: 'handle required' }, { status: 400, headers: noStore })
  }

  try {
    const removed = await deletePin(handle)
    if (!removed) {
      return Response.json({ error: 'no such pin' }, { status: 404, headers: noStore })
    }
    return Response.json({ removed: handle }, { headers: noStore })
  } catch (err) {
    console.error('DELETE /api/admin/pins/[handle] failed:', err)
    return Response.json({ error: 'delete failed' }, { status: 503, headers: noStore })
  }
}
