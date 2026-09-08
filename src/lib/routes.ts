export function handleFromPath(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  const at = path.match(/^\/@([^/]+)$/)
  if (at) return decodeURIComponent(at[1])
  const slash = path.match(/^\/p\/([^/]+)$/)
  if (slash) return decodeURIComponent(slash[1])
  return null
}

export function pinPath(handle: string): string {
  return `/@${encodeURIComponent(handle)}`
}

export function pinUrl(handle: string): string {
  return `${window.location.origin}${pinPath(handle)}`
}

/** The site root, for links that should land on the globe rather than one pin. */
export function siteUrl(): string {
  return window.location.origin
}

export function setPinPath(handle: string): void {
  const next = pinPath(handle)
  if (window.location.pathname !== next) {
    window.history.pushState({ handle }, '', next)
  }
}

export function setHomePath(): void {
  if (window.location.pathname !== '/') {
    window.history.pushState({}, '', '/')
  }
}

export function setPageMeta(opts: { title: string; description: string }): void {
  document.title = opts.title
  const desc = document.querySelector('meta[name="description"]')
  if (desc) desc.setAttribute('content', opts.description)
  const ogTitle = document.querySelector('meta[property="og:title"]')
  if (ogTitle) ogTitle.setAttribute('content', opts.title)
  const ogDesc = document.querySelector('meta[property="og:description"]')
  if (ogDesc) ogDesc.setAttribute('content', opts.description)
}
