import type { Pin } from '../types'

export type Cluster = {
  id: string
  lat: number
  lng: number
  count: number
  pins: Pin[]
}

/** A cell holding fewer than this many pins is drawn as individual pins. */
export const MIN_CLUSTER_SIZE = 3

// Camera distance bounds, mirroring the OrbitControls limits in Scene.tsx.
const FAR = 4.6
const NEAR = 2.15
// Cell size in degrees at each end of the zoom range. The near value is small
// enough that neighbouring cities resolve into separate pins once you zoom in.
const CELL_FAR = 16
const CELL_NEAR = 0.6

/**
 * Buckets pins into a lat/lng grid and splits the result: crowded cells become
 * clusters, sparse ones stay as individual pins.
 *
 * The globe used to flip wholesale between "all pins" and "all clusters" once
 * the total crossed a threshold, which meant that past 500 pins nothing but
 * cluster blobs ever rendered -- at any zoom level, including fully zoomed in.
 * Density is the thing that actually matters: a lone pin in the middle of an
 * ocean should look like a pin no matter how many pins exist elsewhere.
 */
export function groupByCell(pins: Pin[], cellDeg: number): { loose: Pin[]; clusters: Cluster[] } {
  const buckets = new Map<string, Pin[]>()
  for (const pin of pins) {
    const lat = Math.round(pin.lat / cellDeg) * cellDeg
    const lng = Math.round(pin.lng / cellDeg) * cellDeg
    const key = `${lat}:${lng}`
    const list = buckets.get(key)
    if (list) list.push(pin)
    else buckets.set(key, [pin])
  }

  const loose: Pin[] = []
  const clusters: Cluster[] = []
  for (const [id, group] of buckets) {
    if (group.length < MIN_CLUSTER_SIZE) {
      for (const pin of group) loose.push(pin)
      continue
    }
    clusters.push({
      id,
      lat: group.reduce((s, p) => s + p.lat, 0) / group.length,
      lng: group.reduce((s, p) => s + p.lng, 0) / group.length,
      count: group.length,
      pins: group,
    })
  }
  return { loose, clusters }
}

/**
 * Grid cell size for a camera distance, shrinking smoothly as you zoom in so
 * clusters visibly break apart rather than snapping between fixed tiers.
 */
export function clusterCell(cameraDistance: number): number {
  const span = FAR - NEAR
  const t = Math.min(1, Math.max(0, (FAR - cameraDistance) / span))
  return CELL_FAR * (CELL_NEAR / CELL_FAR) ** t
}
