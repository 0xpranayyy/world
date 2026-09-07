import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNominatim } from '../hooks/useNominatim'
import { reverseGeocode } from '../lib/geocode'
import { loginUrl } from '../lib/auth'
import { DuplicateHandleError, RateLimitedError, SignInRequiredError } from '../storage'
import type { GeoSuggestion, Pin, PinDraft } from '../types'

type AddPinPanelProps = {
  open: boolean
  myHandle: string | null
  onOpen: () => void
  onClose: () => void
  prefill: GeoSuggestion | null
  onDrop: (draft: PinDraft) => Promise<Pin>
  onDropped: (pin: Pin) => void
  onPick?: (location: { lat: number; lng: number } | null) => void
}

export function AddPinPanel({
  open,
  myHandle,
  onOpen,
  onClose,
  prefill,
  onDrop,
  onDropped,
  onPick,
}: AddPinPanelProps) {
  const [city, setCity] = useState('')
  const [picked, setPicked] = useState<GeoSuggestion | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [geoBusy, setGeoBusy] = useState(false)
  const handleRef = useRef<HTMLInputElement>(null)
  const { suggestions, loading } = useNominatim(picked ? '' : city)

  useEffect(() => {
    if (!prefill) return
    setPicked(prefill)
    setCity(prefill.displayName)
    setError(null)
    window.setTimeout(() => handleRef.current?.focus(), 40)
  }, [prefill])

  useEffect(() => {
    onPick?.(picked ? { lat: picked.lat, lng: picked.lng } : null)
  }, [picked, onPick])

  const canSubmit = useMemo(() => {
    return myHandle != null && picked != null && !busy
  }, [myHandle, picked, busy])

  const pickSuggestion = (item: GeoSuggestion) => {
    setPicked(item)
    setCity(item.displayName)
    setActiveIndex(0)
  }

  const onCityChange = (value: string) => {
    setCity(value)
    setPicked(null)
    setActiveIndex(0)
    setError(null)
  }

  const onCityKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (!suggestions.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter' && !picked) {
      event.preventDefault()
      pickSuggestion(suggestions[activeIndex] ?? suggestions[0])
    }
  }

  const locateMe = async () => {
    if (!navigator.geolocation) {
      setError('location not available')
      return
    }
    setGeoBusy(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void reverseGeocode(pos.coords.latitude, pos.coords.longitude)
          .then((place) => {
            if (!place) {
              setPicked({
                id: 'here',
                displayName: 'your location',
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              })
              setCity('your location')
              return
            }
            pickSuggestion(place)
            handleRef.current?.focus()
          })
          .finally(() => setGeoBusy(false))
      },
      () => {
        setGeoBusy(false)
        setError('location denied')
      },
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!picked) {
      setError('pick a city from the list')
      return
    }
    if (!myHandle) {
      setError('sign in with X first')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const pin = await onDrop({
        handle: myHandle,
        locationName: picked.displayName,
        lat: picked.lat,
        lng: picked.lng,
      })
      setCity('')
      setPicked(null)
      onDropped(pin)
    } catch (err) {
      if (err instanceof DuplicateHandleError || err instanceof RateLimitedError || err instanceof SignInRequiredError) {
        setError(err.message)
      } else {
        setError('could not drop pin')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="panel-chip" onClick={onOpen}>
        drop pin
      </button>
    )
  }

  if (!myHandle) {
    return (
      <div className="panel add-pin">
        <div className="panel-top">
          <p className="panel-kicker">drop a pin</p>
          <button type="button" className="icon-btn" onClick={onClose}>
            hide
          </button>
        </div>
        <p className="tertiary hint">sign in with X to prove the pin is really yours.</p>
        <a className="drop" href={loginUrl()}>
          sign in with X
        </a>
      </div>
    )
  }

  return (
    <form className="panel add-pin" onSubmit={submit}>
      <div className="panel-top">
        <p className="panel-kicker">drop a pin</p>
        <button type="button" className="icon-btn" onClick={onClose}>
          hide
        </button>
      </div>
      <p className="tertiary hint">posting as @{myHandle}</p>
      <label className="field">
        <span>city</span>
        <input
          ref={handleRef}
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          onKeyDown={onCityKeyDown}
          autoComplete="off"
          placeholder="search a city or tap the globe"
          name="city"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls="city-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={
            suggestions[activeIndex] ? `city-opt-${suggestions[activeIndex].id}` : undefined
          }
        />
      </label>
      {suggestions.length > 0 && !picked ? (
        <ul id="city-suggestions" className="suggestions" role="listbox">
          {suggestions.map((item, index) => (
            <li key={item.id} role="presentation">
              <button
                id={`city-opt-${item.id}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'active' : undefined}
                onClick={() => pickSuggestion(item)}
              >
                {item.displayName}
              </button>
            </li>
          ))}
        </ul>
      ) : loading ? (
        <p className="tertiary hint">searching…</p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <button type="button" className="text-link" onClick={() => void locateMe()} disabled={geoBusy}>
        {geoBusy ? 'finding you…' : 'use my location'}
      </button>
      <button type="submit" className="drop" disabled={!canSubmit}>
        {busy ? 'dropping…' : 'drop pin'}
      </button>
    </form>
  )
}
