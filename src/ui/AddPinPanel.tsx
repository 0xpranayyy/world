import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { normalizeHandle } from '../geo'
import { useNominatim } from '../hooks/useNominatim'
import { reverseGeocode } from '../lib/geocode'
import { DuplicateHandleError } from '../storage'
import type { GeoSuggestion, Pin, PinDraft } from '../types'

type AddPinPanelProps = {
  open: boolean
  onOpen: () => void
  onClose: () => void
  prefill: GeoSuggestion | null
  onDrop: (draft: PinDraft) => Promise<Pin>
  onDropped: (pin: Pin) => void
}

export function AddPinPanel({
  open,
  onOpen,
  onClose,
  prefill,
  onDrop,
  onDropped,
}: AddPinPanelProps) {
  const [handle, setHandle] = useState('')
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

  const canSubmit = useMemo(() => {
    return normalizeHandle(handle).length > 0 && picked != null && !busy
  }, [handle, picked, busy])

  const onHandleChange = (value: string) => {
    setHandle(normalizeHandle(value))
    setError(null)
  }

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
    const normalized = normalizeHandle(handle)
    if (!normalized) {
      setError('add a handle')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const pin = await onDrop({
        handle: normalized,
        locationName: picked.displayName,
        lat: picked.lat,
        lng: picked.lng,
      })
      setHandle('')
      setCity('')
      setPicked(null)
      onDropped(pin)
    } catch (err) {
      if (err instanceof DuplicateHandleError) {
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

  return (
    <form className="panel add-pin" onSubmit={submit}>
      <div className="panel-top">
        <p className="panel-kicker">drop a pin</p>
        <button type="button" className="icon-btn" onClick={onClose}>
          hide
        </button>
      </div>
      <label className="field">
        <span>handle</span>
        <input
          ref={handleRef}
          value={handle}
          onChange={(e) => onHandleChange(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name"
          name="handle"
          inputMode="text"
          maxLength={32}
        />
      </label>
      <label className="field">
        <span>city</span>
        <input
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
