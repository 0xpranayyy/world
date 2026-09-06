import type { Pin } from '../types'

export type Cluster = {
  id: string
  lat: number
  lng: number
  count: number
  pins: Pin[]
}

export function clusterPins(pins: Pin[], cellDeg: number): Cluster[] {
  const buckets = new Map<string, Pin[]>()
  for (const pin of pins) {
    const lat = Math.round(pin.lat / cellDeg) * cellDeg
    const lng = Math.round(pin.lng / cellDeg) * cellDeg
    const key = `${lat}:${lng}`
    const list = buckets.get(key)
    if (list) list.push(pin)
    else buckets.set(key, [pin])
  }
  return [...buckets.entries()].map(([id, group]) => ({
    id,
    lat: group.reduce((s, p) => s + p.lat, 0) / group.length,
    lng: group.reduce((s, p) => s + p.lng, 0) / group.length,
    count: group.length,
    pins: group,
  }))
}

export function shouldCluster(pinCount: number, cameraDistance: number): boolean {
  if (cameraDistance > 4.05) return pinCount >= 8
  if (cameraDistance > 3.45) return pinCount >= 24
  return pinCount >= 500
}

export function clusterCell(cameraDistance: number): number {
  if (cameraDistance > 4.1) return 18
  if (cameraDistance > 3.6) return 10
  return 6
}
