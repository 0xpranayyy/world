import { useCallback, useEffect, useRef, useState } from 'react'
import { addPin, listPins, moveMyPin, subscribePins } from '../storage'
import type { Pin, PinDraft } from '../types'

export function usePins() {
  const [pins, setPins] = useState<Pin[]>([])
  const [arrivals, setArrivals] = useState<Pin[]>([])
  const known = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    void listPins().then((next) => {
      if (cancelled) return
      known.current = new Set(next.map((p) => p.id))
      setPins(next)
    })
    const stop = subscribePins((next) => {
      const fresh = next.filter((p) => !known.current.has(p.id))
      known.current = new Set(next.map((p) => p.id))
      setPins(next)
      if (fresh.length) {
        setArrivals((current) => [...current, ...fresh].slice(-8))
      }
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [])

  const dropPin = useCallback(async (draft: PinDraft) => {
    const pin = await addPin(draft)
    known.current.add(pin.id)
    setPins((current) =>
      current.some((p) => p.id === pin.id) ? current : [...current, pin],
    )
    setArrivals((current) => [...current, pin].slice(-8))
    return pin
  }, [])

  const movePin = useCallback(async (location: { locationName: string; lat: number; lng: number }) => {
    const pin = await moveMyPin(location)
    setPins((current) => current.map((p) => (p.id === pin.id ? pin : p)))
    return pin
  }, [])

  const dismissArrival = useCallback((id: string) => {
    setArrivals((current) => current.filter((p) => p.id !== id))
  }, [])

  return { pins, dropPin, movePin, arrivals, dismissArrival }
}
