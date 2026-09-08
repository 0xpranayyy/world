import { useEffect, useState } from 'react'
import { placeCount, type PlaceScope } from '../geo'
import { copyPng, renderShareCard, shareCaption, tweetIntentUrl } from '../lib/shareCard'
import { pinUrl, siteUrl } from '../lib/routes'
import type { Pin } from '../types'

const SCOPES: PlaceScope[] = ['city', 'country', 'continent']

type ShareCardProps = {
  pin: Pin
  pins: Pin[]
  onClose: () => void
}

export function ShareCard({ pin, pins, onClose }: ShareCardProps) {
  const [scope, setScope] = useState<PlaceScope>('city')
  const [url, setUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [busy, setBusy] = useState<'x' | 'save' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const permalink = pinUrl(pin.handle)
  const inPlace = placeCount(pins, pin, scope)
  const filename = `world-${pin.handle}-${scope}.png`
  const caption = shareCaption(pin, siteUrl(), scope)

  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false
    setUrl(null)
    setBlob(null)
    setError(null)
    void renderShareCard(pin, {
      count: pins.length,
      placeCount: inPlace,
      permalink,
      scope,
    })
      .then((next) => {
        if (cancelled) return
        const objectUrl = URL.createObjectURL(next)
        revoked = objectUrl
        setBlob(next)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setError('could not render card')
      })
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [inPlace, permalink, pin, pins.length, scope])

  const save = async () => {
    if (!blob) return
    setBusy('save')
    setError(null)
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(href)
    setNote('png saved')
    setBusy(null)
  }

  const shareToX = async () => {
    if (!blob) return
    setBusy('x')
    setError(null)
    const copied = await copyPng(blob)
    window.open(tweetIntentUrl(caption), '_blank', 'noopener,noreferrer')
    setNote(
      copied
        ? 'caption ready on x · paste the image in the post'
        : 'download the png and attach it on x',
    )
    setBusy(null)
  }

  return (
    <div
      className="share-overlay"
      role="dialog"
      aria-labelledby="share-card-title"
      onClick={onClose}
    >
      <div className="share-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="share-head">
          <p id="share-card-title">your pin card</p>
          <button type="button" className="icon-btn" onClick={onClose}>
            close
          </button>
        </div>
        <div className="scope-row" role="tablist" aria-label="card place">
          {SCOPES.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={scope === item}
              className={scope === item ? 'scope active' : 'scope'}
              onClick={() => setScope(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="share-preview">
          {url ? (
            <img src={url} alt={`share card for @${pin.handle} · ${scope}`} />
          ) : (
            <p className="tertiary">{error ?? 'composing…'}</p>
          )}
        </div>
        {error && url ? <p className="error">{error}</p> : null}
        {note ? <p className="share-note">{note}</p> : null}
        <div className="share-actions">
          <button type="button" className="drop" onClick={() => void shareToX()} disabled={!blob || busy != null}>
            {busy === 'x' ? 'opening x…' : 'share to x'}
          </button>
          <button type="button" className="drop ghost" onClick={() => void save()} disabled={!blob || busy != null}>
            {busy === 'save' ? 'saving…' : 'download png'}
          </button>
        </div>
      </div>
    </div>
  )
}
