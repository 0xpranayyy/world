import { useCallback, useEffect, useRef, useState } from 'react'
import { addPin, listPins, moveMyPin, subscribePins } from '../storage'
import type { Pin, PinDraft } from '../types'

/**
 * Pins this client just wrote, held until a server response reflects them.
 *
 * The poll replaces the whole list every few seconds, and the pin list is
 * served from a short-lived edge cache. A response fetched moments after you
 * drop a pin can legitimately predate the write -- so overwriting state with it
 * made your own pin vanish for a poll or two before flickering back. Keeping
 * unconfirmed local writes and layering them over each response removes that
 * window without pretending the server said something it didn't.
 */
function mergePending(server: Pin[], pending: Map<string, Pin>): Pin[] {
  if (pending.size === 0) return server

  const merged = server.map((pin) => {
    const mine = pending.get(pin.id)
    if (!mine) return pin
    // Same pin, same place: the server has caught up, so stop overriding it.
    if (mine.lat === pin.lat && mine.lng === pin.lng && mine.locationName === pin.locationName) {
      pending.delete(pin.id)
      return pin
    }
    // A move the server hasn't published yet -- keep showing the new location
    // rather than letting the pin jump back to where it used to be.
    return mine
  })

  const present = new Set(server.map((pin) => pin.id))
  for (const [id, pin] of pending) {
    if (!present.has(id)) merged.push(pin)
  }
  return merged
}

export function usePins() {
  const [pins, setPins] = useState<Pin[]>([])
  const [arrivals, setArrivals] = useState<Pin[]>([])
  const known = useRef(new Set<string>())
  const pending = useRef(new Map<string, Pin>())

  useEffect(() => {
    let cancelled = false
    const apply = (next: Pin[], announce: boolean) => {
      const merged = mergePending(next, pending.current)
      const fresh = announce ? merged.filter((pin) => !known.current.has(pin.id)) : []
      known.current = new Set(merged.map((pin) => pin.id))
      setPins(merged)
      if (fresh.length) setArrivals((current) => [...current, ...fresh].slice(-8))
    }

    void listPins().then((next) => {
      if (cancelled) return
      apply(next, false)
    })
    const stop = subscribePins((next) => apply(next, true))
    return () => {
      cancelled = true
      stop()
    }
  }, [])

  const dropPin = useCallback(async (draft: PinDraft) => {
    const pin = await addPin(draft)
    known.current.add(pin.id)
    pending.current.set(pin.id, pin)
    setPins((current) => (current.some((p) => p.id === pin.id) ? current : [...current, pin]))
    setArrivals((current) => [...current, pin].slice(-8))
    return pin
  }, [])

  const movePin = useCallback(async (location: { locationName: string; lat: number; lng: number }) => {
    const pin = await moveMyPin(location)
    pending.current.set(pin.id, pin)
    setPins((current) => current.map((p) => (p.id === pin.id ? pin : p)))
    return pin
  }, [])

  const dismissArrival = useCallback((id: string) => {
    setArrivals((current) => current.filter((p) => p.id !== id))
  }, [])

  return { pins, dropPin, movePin, arrivals, dismissArrival }
}
