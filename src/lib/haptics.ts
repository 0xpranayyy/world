export function haptic(kind: 'select' | 'drop' = 'select'): void {
  const ms = kind === 'drop' ? [12, 30, 18] : [8]
  try {
    window.navigator.vibrate?.(ms)
  } catch {
    /* ignore */
  }
}
