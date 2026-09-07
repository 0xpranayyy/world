import { useEffect, useState } from 'react'
import {
  musicEnabled,
  rememberMusic,
  startMusic,
  stopMusic,
  trackAvailable,
  watchVisibility,
} from '../lib/ambientAudio'

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6.2h2.1L8 3.8v8.4L5.1 9.8H3a.6.6 0 0 1-.6-.6V6.8a.6.6 0 0 1 .6-.6Z" />
      {on ? (
        <>
          <path d="M10.4 6.1a2.6 2.6 0 0 1 0 3.8" />
          <path d="M12.2 4.4a5 5 0 0 1 0 7.2" />
        </>
      ) : (
        <path d="M10.8 6.4l3.2 3.2M14 6.4l-3.2 3.2" />
      )}
    </svg>
  )
}

/**
 * Renders nothing until a track is confirmed present, so the app never ships a
 * control that silently does nothing. Starts off by choice as well as by
 * necessity: browsers block autoplay with sound, and music nobody asked for is
 * a bad way to greet someone.
 */
export function MusicToggle() {
  const [available, setAvailable] = useState(false)
  const [on, setOn] = useState(false)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    let cancelled = false
    void trackAvailable().then((ok) => {
      if (cancelled) return
      setAvailable(ok)
      // Someone who turned it on last visit still has to interact once this
      // visit before the browser will allow sound, so don't presume it started.
      if (ok && musicEnabled()) {
        void startMusic().then((started) => {
          if (!cancelled) setOn(started)
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => watchVisibility(() => on), [on])

  if (!available) return null

  const toggle = () => {
    if (on) {
      stopMusic()
      setOn(false)
      rememberMusic(false)
      return
    }
    void startMusic().then((started) => {
      setOn(started)
      setBlocked(!started)
      rememberMusic(started)
    })
  }

  return (
    <button
      type="button"
      className={`music-toggle${on ? ' is-on' : ''}`}
      onClick={toggle}
      aria-pressed={on}
      title={blocked ? 'your browser blocked playback — try again' : on ? 'turn music off' : 'turn music on'}
    >
      <SpeakerIcon on={on} />
      <span>{on ? 'music on' : 'music off'}</span>
    </button>
  )
}
