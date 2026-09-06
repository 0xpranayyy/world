import { list, put } from '@vercel/blob'

type Bucket = { count: number; windowStart: number }

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip') ?? 'unknown'
}

async function hash(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function readBucket(pathname: string): Promise<Bucket | null> {
  const { blobs } = await list({ prefix: pathname, limit: 8 })
  const found = blobs.find((blob) => blob.pathname === pathname)
  if (!found) return null
  const res = await fetch(found.url, { cache: 'no-store' })
  if (!res.ok) return null
  const parsed: unknown = await res.json()
  if (typeof parsed !== 'object' || parsed === null) return null
  const v = parsed as Record<string, unknown>
  if (typeof v.count !== 'number' || typeof v.windowStart !== 'number') return null
  return { count: v.count, windowStart: v.windowStart }
}

/**
 * A lightweight, best-effort rate limit backed by Blob storage: no new
 * infrastructure to provision, at the cost of not being perfectly atomic
 * under very high concurrency from a single IP (a determined attacker could
 * occasionally slip a couple of extra requests through a race window). That
 * trade-off is fine for abuse throttling -- unlike pin data, this doesn't
 * need to be exact, just meaningfully effective.
 */
export async function checkRateLimit(
  request: Request,
  opts: { key: string; limit: number; windowMs: number },
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const ip = clientIp(request)
  const pathname = `ratelimit/${opts.key}/${await hash(ip)}.json`
  const now = Date.now()

  const bucket = await readBucket(pathname)
  const windowStart = bucket && now - bucket.windowStart < opts.windowMs ? bucket.windowStart : now
  const count = bucket && windowStart === bucket.windowStart ? bucket.count : 0

  if (count >= opts.limit) {
    const retryAfterSeconds = Math.ceil((windowStart + opts.windowMs - now) / 1000)
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) }
  }

  await put(pathname, JSON.stringify({ count: count + 1, windowStart } satisfies Bucket), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
    allowOverwrite: true,
  }).catch(() => {
    /* best-effort: a failed bucket write just means this request isn't counted */
  })

  return { allowed: true }
}
