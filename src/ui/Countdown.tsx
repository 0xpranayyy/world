import { useEffect, useState } from 'react'

function septemberNinth(year: number): Date {
  return new Date(year, 8, 9, 0, 0, 0)
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function Countdown() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const current = new Date(now)
  let target = septemberNinth(current.getFullYear())
  const dayMs = 24 * 60 * 60 * 1000
  if (now >= target.getTime() + dayMs) {
    target = septemberNinth(current.getFullYear() + 1)
  }
  const remain = target.getTime() - now
  const arrived = remain <= 0 && now < target.getTime() + dayMs
  const s = Math.max(0, Math.floor(remain / 1000))
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60

  return (
    <div className="countdown" aria-live="polite">
      <p className="countdown-kicker">{arrived ? 'today' : 'until 9 september'}</p>
      {arrived ? (
        <p className="countdown-live">9 september</p>
      ) : (
        <ol className="countdown-row">
          {(
            [
              ['days', days, String(days)],
              ['hours', hours, pad(hours)],
              ['min', minutes, pad(minutes)],
              ['sec', seconds, pad(seconds)],
            ] as const
          ).map(([label, , value]) => (
            <li key={label}>
              <span className="countdown-num">{value}</span>
              <span className="countdown-lbl">{label}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
