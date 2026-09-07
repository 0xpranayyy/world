import { createOAuthStateCookie, randomToken, sha256Base64Url } from '../_lib/session.js'

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} not configured`)
  return value
}

function callbackUrl(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}/api/auth/callback`
}

// Starts the X (Twitter) OAuth 2.0 + PKCE flow. The verifier and CSRF state
// live in a short-lived signed cookie so /api/auth/callback can validate
// them without needing any server-side session store.
export async function GET(request: Request): Promise<Response> {
  const clientId = requiredEnv('X_CLIENT_ID')
  const verifier = randomToken(48)
  const challenge = await sha256Base64Url(verifier)
  const state = randomToken(24)

  const authorize = new URL('https://twitter.com/i/oauth2/authorize')
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('redirect_uri', callbackUrl(request))
  authorize.searchParams.set('scope', 'users.read tweet.read')
  authorize.searchParams.set('state', state)
  authorize.searchParams.set('code_challenge', challenge)
  authorize.searchParams.set('code_challenge_method', 'S256')

  const cookie = await createOAuthStateCookie({ verifier, state })
  return new Response(null, {
    status: 302,
    headers: { Location: authorize.toString(), 'Set-Cookie': cookie },
  })
}
