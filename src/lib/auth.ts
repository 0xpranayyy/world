export type SessionInfo = { email: string; name: string } | null

export async function fetchSession(): Promise<SessionInfo> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (!res.ok) return null
    const data = (await res.json()) as { email: string | null; name: string | null }
    return data.email ? { email: data.email, name: data.name ?? '' } : null
  } catch {
    return null
  }
}

export function loginUrl(): string {
  return '/api/auth/login'
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  } catch {
    /* ignore */
  }
}
