export function hasWebGL(): boolean {
  // Append ?nowebgl=1 to force the static CSS globe (WebGL unavailable path).
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nowebgl')) {
    return false
  }
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
