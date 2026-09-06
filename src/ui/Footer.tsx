import { useEffect, useState } from 'react'

const CREATOR_URL = 'https://x.com/_sol_moonboy'
const CREATOR_IMAGE = 'https://pbs.twimg.com/profile_images/1947295125828403200/fWBE9wGs_400x400.jpg'
const COUNTDOWN_TARGET = new Date('2026-09-09T00:00:00').getTime()

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

function useCountdown(target: number) {
  const [remaining, setRemaining] = useState(() => target - Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setRemaining(target - Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [target])

  return Math.max(0, remaining)
}

export function Footer() {
  const remaining = useCountdown(COUNTDOWN_TARGET)
  const totalSeconds = Math.floor(remaining / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const isLive = remaining <= 0

  return (
    <footer className="site-footer">
      <a
        className="footer-credit"
        href={CREATOR_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img className="footer-avatar" src={CREATOR_IMAGE} alt="" aria-hidden="true" />
        <span className="footer-credit-text">
          made with <span className="footer-heart">♥</span> by{' '}
          <span className="footer-credit-name">sol investigator</span>
        </span>
      </a>

      <div className="footer-countdown" role="timer" aria-live="off">
        <span className="footer-countdown-dot" aria-hidden="true" />
        {isLive ? (
          <span className="footer-countdown-label">it's here</span>
        ) : (
          <>
            <span className="footer-countdown-label">something big is coming · sep 9</span>
            <span className="footer-countdown-time">
              {days > 0 ? <span className="footer-countdown-days">{days}d</span> : null}
              <span>{pad(hours)}</span>
              <span className="footer-countdown-colon">:</span>
              <span>{pad(minutes)}</span>
              <span className="footer-countdown-colon">:</span>
              <span>{pad(seconds)}</span>
            </span>
          </>
        )}
      </div>
    </footer>
  )
}
