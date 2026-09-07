import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

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

/**
 * A best-effort rate limit backed by the same Supabase database as pins, so
 * there's no separate infrastructure to provision. Like the earlier
 * Blob-backed version, this isn't perfectly atomic under very high
 * concurrency from a single IP -- fine for abuse throttling, which doesn't
 * need to be exact the way pin data does.
 */
export async function checkRateLimit(
  request: Request,
  opts: { key: string; limit: number; windowMs: number },
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const ip = clientIp(request)
  const key = `${opts.key}:${await hash(ip)}`
  const now = Date.now()

  const { data, error: readError } = await supabase
    .from('rate_limits')
    .select('count, window_start')
    .eq('key', key)
    .maybeSingle()
  if (readError) {
    // Fail open -- a broken rate limiter shouldn't take down the feature it's
    // protecting -- but log loudly, since silently treating every read
    // failure as "no record, allow" is exactly how this went undetected
    // before: the limiter let every request through with no visible sign
    // anything was wrong.
    console.error('checkRateLimit: read failed, failing open:', readError.message)
    return { allowed: true }
  }

  const windowStart = data && now - Number(data.window_start) < opts.windowMs ? Number(data.window_start) : now
  const count = data && windowStart === Number(data.window_start) ? data.count : 0

  if (count >= opts.limit) {
    const retryAfterSeconds = Math.ceil((windowStart + opts.windowMs - now) / 1000)
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) }
  }

  const { error: writeError } = await supabase
    .from('rate_limits')
    .upsert({ key, count: count + 1, window_start: windowStart })
  if (writeError) {
    console.error('checkRateLimit: write failed:', writeError.message)
  }

  return { allowed: true }
}
