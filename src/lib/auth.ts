export async function fetchSessionHandle(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (!res.ok) return null
    const data = (await res.json()) as { handle: string | null }
    return data.handle
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
