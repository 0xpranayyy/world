import {
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Float32BufferAttribute,
  LinearFilter,
  RepeatWrapping,
} from 'three'
import { latLngToVector3 } from '../geo'

type Position = [number, number]
type LinearRing = Position[]
type Polygon = LinearRing[]
type MultiPolygon = Polygon[]

type Geometry =
  | { type: 'Polygon'; coordinates: Polygon }
  | { type: 'MultiPolygon'; coordinates: MultiPolygon }

type CountryProperties = {
  NAME?: string
  LABEL_X?: number
  LABEL_Y?: number
  LABELRANK?: number
}

type Feature = { geometry: Geometry | null; properties?: CountryProperties }

type FeatureCollection = {
  type: 'FeatureCollection'
  features: Feature[]
}

export type MapLabel = { name: string; lat: number; lng: number; rank: number }

export type LandAssets = {
  texture: CanvasTexture
  coasts: BufferGeometry
  borders: BufferGeometry
  labels: { continents: MapLabel[]; countries: MapLabel[] }
}

// Hand-placed centroids rather than computed ones -- a computed centroid for
// a continent as spread out as Asia or split like Oceania lands somewhere
// unhelpful (open ocean, the wrong sub-region). Rank 0 so continent labels
// always render regardless of the zoom-based country label cutoff.
const CONTINENT_LABELS: MapLabel[] = [
  { name: 'africa', lat: 2, lng: 20, rank: 0 },
  { name: 'asia', lat: 48, lng: 90, rank: 0 },
  { name: 'europe', lat: 54, lng: 15, rank: 0 },
  { name: 'north america', lat: 45, lng: -100, rank: 0 },
  { name: 'south america', lat: -15, lng: -60, rank: 0 },
  { name: 'oceania', lat: -25, lng: 140, rank: 0 },
  { name: 'antarctica', lat: -82, lng: 0, rank: 0 },
]

function countryLabels(countries: FeatureCollection): MapLabel[] {
  const labels: MapLabel[] = []
  for (const feature of countries.features) {
    const p = feature.properties
    if (!p?.NAME || typeof p.LABEL_X !== 'number' || typeof p.LABEL_Y !== 'number') continue
    labels.push({ name: p.NAME, lat: p.LABEL_Y, lng: p.LABEL_X, rank: p.LABELRANK ?? 5 })
  }
  return labels
}

function ringsFromGeometry(geometry: Geometry | null): LinearRing[] {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return geometry.coordinates
  return geometry.coordinates.flat()
}

function densify(ring: LinearRing, maxDeg = 1.2): LinearRing {
  const out: LinearRing = []
  const n = ring.length
  if (n < 2) return ring
  for (let i = 0; i < n - 1; i += 1) {
    const a = ring[i]
    const b = ring[i + 1]
    out.push(a)
    let dlng = b[0] - a[0]
    if (dlng > 180) dlng -= 360
    if (dlng < -180) dlng += 360
    const dlat = b[1] - a[1]
    const dist = Math.hypot(dlng, dlat)
    const steps = Math.max(1, Math.ceil(dist / maxDeg))
    for (let s = 1; s < steps; s += 1) {
      const t = s / steps
      out.push([a[0] + dlng * t, a[1] + dlat * t])
    }
  }
  out.push(ring[n - 1])
  return out
}

function project(lng: number, lat: number, width: number, height: number): [number, number] {
  const x = ((lng + 180) / 360) * width
  const y = ((90 - lat) / 180) * height
  return [x, y]
}

function paintMask(features: Feature[], width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.25

  for (const feature of features) {
    const geometry = feature.geometry
    if (!geometry) continue
    const polygons: Polygon[] =
      geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    for (const polygon of polygons) {
      ctx.beginPath()
      for (const ring of polygon) {
        const dense = densify(ring, 0.8)
        dense.forEach(([lng, lat], i) => {
          const [x, y] = project(lng, lat, width, height)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.closePath()
      }
      ctx.fill('evenodd')
    }
  }
  return canvas
}

function ringsToLineGeometry(rings: LinearRing[], radius: number): BufferGeometry {
  const positions: number[] = []
  const tmpA = latLngToVector3(0, 0, radius)
  const tmpB = latLngToVector3(0, 0, radius)

  for (const ring of rings) {
    const dense = densify(ring, 1.1)
    for (let i = 0; i < dense.length - 1; i += 1) {
      const a = dense[i]
      const b = dense[i + 1]
      let dlng = Math.abs(b[0] - a[0])
      if (dlng > 180) continue
      latLngToVector3(a[1], a[0], radius, tmpA)
      latLngToVector3(b[1], b[0], radius, tmpB)
      positions.push(tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

async function loadCollection(url: string): Promise<FeatureCollection> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to load ${url}`)
  return (await res.json()) as FeatureCollection
}

export async function loadLandAssets(): Promise<LandAssets> {
  const [land, countries] = await Promise.all([
    loadCollection('/geo/land-110m.geojson'),
    loadCollection('/geo/countries-110m.geojson'),
  ])

  const canvas = paintMask(land.features, 2048, 1024)
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true

  const coastRings = land.features.flatMap((f) => ringsFromGeometry(f.geometry))
  const borderRings = countries.features.flatMap((f) => ringsFromGeometry(f.geometry))

  return {
    texture,
    coasts: ringsToLineGeometry(coastRings, 1.0035),
    borders: ringsToLineGeometry(borderRings, 1.0032),
    labels: { continents: CONTINENT_LABELS, countries: countryLabels(countries) },
  }
}
