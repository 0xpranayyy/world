import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

// Supabase's free-tier database size cap. If this project is ever moved to
// a paid plan, bump this (or better, read it from an env var) so the
// warning threshold stays meaningful.
const FREE_TIER_DB_LIMIT_BYTES = 500 * 1024 * 1024
const WARN_AT = 0.7

type UsageStats = { db_size_bytes: number; pins_count: number; rate_limits_count: number }

// Runs on Vercel's cron schedule (see vercel.json). Vercel automatically
// sends `Authorization: Bearer <CRON_SECRET>` for its own cron invocations
// when CRON_SECRET is set, which is what keeps this from being triggerable
// by anyone who finds the URL.
export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }

  const { data, error } = await supabase.rpc('get_usage_stats').single<UsageStats>()
  if (error) {
    console.error('check-usage: rpc failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const dbSizeMb = data.db_size_bytes / (1024 * 1024)
  const usageRatio = data.db_size_bytes / FREE_TIER_DB_LIMIT_BYTES
  const summary = {
    dbSizeMb: Math.round(dbSizeMb * 10) / 10,
    usagePercent: Math.round(usageRatio * 1000) / 10,
    pinsCount: data.pins_count,
    rateLimitsCount: data.rate_limits_count,
  }

  if (usageRatio >= WARN_AT) {
    console.warn('USAGE WARNING: database approaching Supabase free-tier limit', summary)
  } else {
    console.log('check-usage: ok', summary)
  }

  return Response.json(summary)
}
