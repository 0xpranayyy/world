import { MUSIC_KEY } from '../constants'

/** Drop a licensed track here to enable the music toggle. */
export const AMBIENT_TRACK = '/ambient.mp3'

/** Ambient, not a performance -- it should sit under the globe, never on top of it. */
const TARGET_VOLUME = 0.32
const FADE_MS = 900

let el: HTMLAudioElement | null = null
let fadeTimer: number | null = null

function audio(): HTMLAudioElement {
  if (!el) {
    el = new Audio(AMBIENT_TRACK)
    el.loop = true
    el.volume = 0
    // Only the header bytes until someone actually opts in -- visitors who
    // never touch the toggle shouldn't pay to download a track.
    el.preload = 'metadata'
  }
  return el
}

/**
 * Resolves false when there's no track to play, so the toggle can stay hidden
 * rather than shipping a control that does nothing.
 */
export function trackAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = audio()
    if (probe.readyState >= HTMLMediaElement.HAVE_METADATA) {
      resolve(true)
      return
    }
    const ok = () => {
      cleanup()
      resolve(true)
    }
    const fail = () => {
      cleanup()
      resolve(false)
    }
    const cleanup = () => {
      probe.removeEventListener('loadedmetadata', ok)
      probe.removeEventListener('error', fail)
    }
    probe.addEventListener('loadedmetadata', ok)
    probe.addEventListener('error', fail)
    probe.load()
  })
}

function fadeTo(target: number, onDone?: () => void): void {
  const node = audio()
  if (fadeTimer != null) window.clearInterval(fadeTimer)
  const from = node.volume
  const start = performance.now()
  fadeTimer = window.setInterval(() => {
    const t = Math.min(1, (performance.now() - start) / FADE_MS)
    node.volume = from + (target - from) * t
    if (t >= 1) {
      if (fadeTimer != null) window.clearInterval(fadeTimer)
      fadeTimer = null
      onDone?.()
    }
  }, 40)
}

/** Returns false if the browser refused playback, so the UI can stay honest. */
export async function startMusic(): Promise<boolean> {
  const node = audio()
  try {
    node.volume = 0
    await node.play()
    fadeTo(TARGET_VOLUME)
    return true
  } catch {
    // Autoplay policies reject playback that isn't tied to a real gesture.
    return false
  }
}

export function stopMusic(): void {
  const node = audio()
  fadeTo(0, () => node.pause())
}

export function musicEnabled(): boolean {
  try {
    return window.localStorage.getItem(MUSIC_KEY) === 'on'
  } catch {
    return false
  }
}

export function rememberMusic(on: boolean): void {
  try {
    window.localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off')
  } catch {
    /* private mode and blocked storage are fine -- the toggle still works for this visit */
  }
}

/**
 * Music playing on for a tab nobody is looking at is just battery drain, so it
 * pauses on hide and picks back up on return -- but only while the toggle is on.
 */
export function watchVisibility(isOn: () => boolean): () => void {
  const onChange = () => {
    if (!isOn()) return
    if (document.hidden) audio().pause()
    else void audio().play().catch(() => {})
  }
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}
