import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { SEEN_KEY } from './constants'
import { usePins } from './hooks/usePins'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'
import { reverseGeocode } from './lib/geocode'
import { haptic } from './lib/haptics'
import {
  handleFromPath,
  pinPath,
  setHomePath,
  setPageMeta,
  setPinPath,
} from './lib/routes'
import { tick } from './lib/tick'
import { hasWebGL } from './lib/webgl'
import { GlobeCanvas } from './scene/Scene'
import { myHandle } from './storage'
import type { GeoSuggestion, Pin } from './types'
import { AddPinPanel } from './ui/AddPinPanel'
import { PinCard } from './ui/PinCard'
import { PinCounter } from './ui/PinCounter'
import { Search } from './ui/Search'
import { ShareCard } from './ui/ShareCard'
import { StaticGlobe } from './ui/StaticGlobe'
import { Ticker } from './ui/Ticker'

type BoundaryState = { failed: boolean }

class WebGLBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('WebGL scene failed; showing static globe', error, info)
  }

  render() {
    if (this.state.failed) return <StaticGlobe />
    return this.props.children
  }
}

function App() {
  const { pins, dropPin, arrivals, dismissArrival } = usePins()
  const reducedMotion = usePrefersReducedMotion()
  const [selected, setSelected] = useState<Pin | null>(null)
  const [focusPin, setFocusPin] = useState<Pin | null>(null)
  const [sharePin, setSharePin] = useState<Pin | null>(null)
  const [bloomId, setBloomId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [prefill, setPrefill] = useState<GeoSuggestion | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [hint, setHint] = useState(() => !window.localStorage.getItem(SEEN_KEY))
  const [you, setYou] = useState<string | null>(() => myHandle())
  const [webgl] = useState(() => hasWebGL())

  useEffect(() => {
    const fromUrl = handleFromPath(window.location.pathname)
    if (!fromUrl || pins.length === 0) return
    const pin = pins.find((p) => p.handle === fromUrl.toLowerCase())
    if (pin) {
      setSelected(pin)
      setFocusPin(pin)
      setPageMeta({
        title: `@${pin.handle} · world`,
        description: `${pin.handle} dropped a pin in ${pin.locationName}`,
      })
    }
  }, [pins])

  useEffect(() => {
    const onPop = () => {
      const fromUrl = handleFromPath(window.location.pathname)
      if (!fromUrl) {
        setSelected(null)
        setPageMeta({
          title: 'world',
          description: 'drop a pin on world. a living globe of people.',
        })
        return
      }
      const pin = pins.find((p) => p.handle === fromUrl.toLowerCase())
      if (pin) {
        setSelected(pin)
        setFocusPin(pin)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [pins])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA'
      if (event.key === '/' && !typing) {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setSharePin(null)
        setSelected(null)
        setPanelOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const dismissHint = useCallback(() => {
    setHint(false)
    window.localStorage.setItem(SEEN_KEY, '1')
  }, [])

  const onDropped = useCallback(
    (pin: Pin) => {
      dismissHint()
      setYou(pin.handle)
      setBloomId(pin.id)
      setSelected(pin)
      setFocusPin(pin)
      setPanelOpen(false)
      setPinPath(pin.handle)
      setPageMeta({
        title: `@${pin.handle} · world`,
        description: `${pin.handle} dropped a pin in ${pin.locationName}`,
      })
      haptic('drop')
      if (!reducedMotion) tick()
      window.setTimeout(() => setSharePin(pin), 700)
    },
    [dismissHint, reducedMotion],
  )

  const onSelect = useCallback((pin: Pin) => {
    dismissHint()
    setSelected(pin)
    setFocusPin(pin)
    setPinPath(pin.handle)
    haptic('select')
  }, [dismissHint])

  const onTapGlobe = useCallback((lat: number, lng: number) => {
    dismissHint()
    setPanelOpen(true)
    void reverseGeocode(lat, lng).then((place) => {
      setPrefill(
        place ?? {
          id: `${lat},${lng}`,
          displayName: `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`,
          lat,
          lng,
        },
      )
    })
  }, [dismissHint])

  const onFindMe = useCallback(() => {
    const mine = pins.find((p) => p.handle === you)
    if (mine) onSelect(mine)
  }, [onSelect, pins, you])

  const copyMine = useCallback(() => {
    if (!you) return
    void navigator.clipboard.writeText(`${window.location.origin}${pinPath(you)}`)
  }, [you])

  return (
    <div className="app">
      <div className="wash" aria-hidden="true" />
      <header className="brand">
        <span className="brand-orb" aria-hidden="true" />
        <span>world</span>
        {you ? (
          <span className="you-tools">
            <span className="you-here">you're here @{you}</span>
            <button type="button" className="text-link" onClick={onFindMe}>
              find me
            </button>
            <button type="button" className="text-link" onClick={copyMine}>
              copy /@{you}
            </button>
          </span>
        ) : null}
      </header>
      <PinCounter pins={pins} />
      <Search
        pins={pins}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={(pin) => {
          onSelect(pin)
          setSearchOpen(false)
        }}
      />
      {hint ? (
        <p className="first-hint">tap a city or drop a pin · press / to search</p>
      ) : null}
      {webgl ? (
        <WebGLBoundary>
          <GlobeCanvas
            pins={pins}
            focusPin={focusPin}
            bloomId={bloomId}
            youHandle={you}
            onFocusSettled={() => setFocusPin(null)}
            onSelect={onSelect}
            onTapGlobe={onTapGlobe}
            onMiss={() => {
              if (sharePin) return
              setSelected(null)
              setHomePath()
            }}
          />
        </WebGLBoundary>
      ) : (
        <StaticGlobe />
      )}
      {!sharePin && !you ? (
        <AddPinPanel
          open={panelOpen}
          onOpen={() => {
            dismissHint()
            setPanelOpen(true)
          }}
          onClose={() => setPanelOpen(false)}
          prefill={prefill}
          onDrop={dropPin}
          onDropped={onDropped}
        />
      ) : null}
      <Ticker items={arrivals} onGone={dismissArrival} onSelect={onSelect} />
      {selected && !sharePin ? (
        <PinCard
          pin={selected}
          onClose={() => {
            setSelected(null)
            setHomePath()
          }}
          onShare={() => setSharePin(selected)}
        />
      ) : null}
      {sharePin ? (
        <ShareCard pin={sharePin} pins={pins} onClose={() => setSharePin(null)} />
      ) : null}
    </div>
  )
}

export default App
