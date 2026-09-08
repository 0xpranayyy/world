import { MUSIC_KEY } from '../constants'

/**
 * Both files are "Ambient - Ambient Music" by Tatamusic, from Pixabay
 * (pixabay.com/music/ambient-ambient-ambient-music-595127/), used under the
 * Pixabay Content License, which permits commercial use and requires no
 * attribution. Both were encoded from the same 256kbps source rather than
 * from each other, so neither carries a second generation of lossy artefacts.
 *
 * Note the track is registered with YouTube Content ID. That's irrelevant to
 * playing it on a site, but a video recorded off the site could draw a claim.
 *
 * Swapping the track means replacing both files.
 */
const AMBIENT_TRACK_OGG = '/ambient.ogg' // Opus, 2.2MB
const AMBIENT_TRACK_MP3 = '/ambient.mp3' // 128kbps, 2.5MB

/**
 * MP3 pads the start and end of the stream to fill whole frames, and that
 * padding decodes as silence. Opus records how much to skip at each end
 * instead. Safari won't play Opus in an Ogg container and takes the MP3 --
 * the crossfade below covers that padding for it either way.
 */
function pickTrack(): string {
  const probe = document.createElement('audio')
  // canPlayType answers 'probably' | 'maybe' | '' -- only the empty string is a no.
  return probe.canPlayType('audio/ogg; codecs="opus"') !== '' ? AMBIENT_TRACK_OGG : AMBIENT_TRACK_MP3
}

/** Ambient, not a performance -- it should sit under the globe, never on top of it. */
const TARGET_VOLUME = 0.32
const FADE_MS = 900
/** Overlap at the wrap. Long enough to hide a level change, short enough not to smear the piece. */
const CROSSFADE_S = 5
/** Give the incoming player a head start so it isn't buffering when it's needed. */
const WARMUP_S = 10

let players: [HTMLAudioElement, HTMLAudioElement] | null = null
let active = 0
/** Per-player crossfade gain; master volume is applied on top of these. */
let gains = [1, 0]
let master = 0
let playing = false
let crossfading = false
let warmed = false
let fadeTimer: number | null = null
let loopTimer: number | null = null

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

function ensurePlayers(): [HTMLAudioElement, HTMLAudioElement] {
  if (!players) {
    const src = pickTrack()
    const make = () => {
      const a = new Audio(src)
      // Looping is handled here rather than by the element: the browser's own
      // loop restarts the file instantly, which is exactly the hard seam the
      // crossfade exists to smooth over.
      a.loop = false
      a.volume = 0
      // Only header bytes until someone opts in -- visitors who never touch
      // the toggle shouldn't pay to download a track.
      a.preload = 'metadata'
      return a
    }
    players = [make(), make()]
  }
  return players
}

function applyVolumes(): void {
  const p = ensurePlayers()
  p[0].volume = clamp01(master * gains[0])
  p[1].volume = clamp01(master * gains[1])
}

/**
 * Resolves false when there's no track to play, so the toggle can stay hidden
 * rather than shipping a control that does nothing.
 */
export function trackAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = ensurePlayers()[0]
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
  if (fadeTimer != null) window.clearInterval(fadeTimer)
  const from = master
  const start = performance.now()
  fadeTimer = window.setInterval(() => {
    const t = Math.min(1, (performance.now() - start) / FADE_MS)
    master = from + (target - from) * t
    applyVolumes()
    if (t >= 1) {
      if (fadeTimer != null) window.clearInterval(fadeTimer)
      fadeTimer = null
      onDone?.()
    }
  }, 40)
}

/**
 * Hands the track over to the second player before the first one runs out, so
 * the end overlaps the beginning instead of cutting straight to it. Gapless
 * encoding removes the silence at the seam; this covers the musical jump when
 * a track's ending doesn't naturally lead back into its opening.
 */
function tick(): void {
  const p = ensurePlayers()
  const current = p[active]
  const incoming = p[1 - active]
  const duration = current.duration
  if (!Number.isFinite(duration) || duration <= 0) return

  // Never overlap more than a third of the piece, in case the track is swapped
  // for something much shorter than this one.
  const overlap = Math.min(CROSSFADE_S, duration / 3)
  const remaining = duration - current.currentTime

  if (!warmed && remaining <= overlap + WARMUP_S) {
    warmed = true
    if (incoming.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) incoming.load()
  }

  if (!crossfading && remaining <= overlap) {
    crossfading = true
    incoming.currentTime = 0
    void incoming.play().catch(() => {})
  }

  if (!crossfading) return

  // Equal-power rather than linear: two uncorrelated parts of a track summed
  // linearly dip in perceived loudness through the middle of the overlap.
  const t = clamp01((overlap - remaining) / overlap)
  gains[active] = Math.cos((t * Math.PI) / 2)
  gains[1 - active] = Math.sin((t * Math.PI) / 2)
  applyVolumes()

  if (current.ended || remaining <= 0.08) {
    current.pause()
    current.currentTime = 0
    gains[active] = 0
    gains[1 - active] = 1
    active = 1 - active
    crossfading = false
    warmed = false
    applyVolumes()
  }
}

function startLoop(): void {
  if (loopTimer != null) return
  loopTimer = window.setInterval(tick, 50)
}

function stopLoop(): void {
  if (loopTimer != null) window.clearInterval(loopTimer)
  loopTimer = null
}

/** Returns false if the browser refused playback, so the UI can stay honest. */
export async function startMusic(): Promise<boolean> {
  const p = ensurePlayers()
  try {
    master = 0
    gains = active === 0 ? [1, 0] : [0, 1]
    applyVolumes()
    await p[active].play()
    playing = true
    startLoop()
    fadeTo(TARGET_VOLUME)
    return true
  } catch {
    // Autoplay policies reject playback that isn't tied to a real gesture.
    return false
  }
}

export function stopMusic(): void {
  const p = ensurePlayers()
  playing = false
  fadeTo(0, () => {
    stopLoop()
    for (const a of p) a.pause()
    // Reset so the next start begins the piece cleanly rather than mid-phrase.
    p[0].currentTime = 0
    p[1].currentTime = 0
    active = 0
    gains = [1, 0]
    crossfading = false
    warmed = false
  })
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
    if (!isOn() || !playing) return
    const p = ensurePlayers()
    if (document.hidden) {
      stopLoop()
      for (const a of p) a.pause()
      return
    }
    void p[active].play().catch(() => {})
    // Mid-overlap both players were sounding, so bring the incoming one back too.
    if (crossfading) void p[1 - active].play().catch(() => {})
    startLoop()
  }
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}
