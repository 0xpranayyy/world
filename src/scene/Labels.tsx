import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useState, type RefObject } from 'react'
import type { Object3D } from 'three'
import { latLngToVector3 } from '../geo'
import type { MapLabel } from './land'

type LabelsProps = {
  continents: MapLabel[]
  countries: MapLabel[]
  radius: number
  globeRef: RefObject<Object3D | null>
}

type PositionedLabel = { name: string; rank: number; position: [number, number, number] }

function toPositioned(labels: MapLabel[], radius: number): PositionedLabel[] {
  return labels.map((label) => {
    const p = latLngToVector3(label.lat, label.lng, radius * 1.014)
    return { name: label.name, rank: label.rank, position: [p.x, p.y, p.z] }
  })
}

function rankCutoff(distance: number): number {
  if (distance > 4.05) return 2
  if (distance > 3.45) return 3
  return 7
}

export function Labels({ continents, countries, radius, globeRef }: LabelsProps) {
  const [distance, setDistance] = useState(3.28)

  useFrame((state) => {
    const next = state.camera.position.length()
    if (Math.abs(next - distance) > 0.08) setDistance(next)
  })

  const continentPoints = useMemo(() => toPositioned(continents, radius), [continents, radius])
  const countryPoints = useMemo(() => toPositioned(countries, radius), [countries, radius])

  const maxRank = rankCutoff(distance)
  const visibleCountries = useMemo(
    () => countryPoints.filter((p) => p.rank <= maxRank),
    [countryPoints, maxRank],
  )

  return (
    <group>
      {continentPoints.map((p) => (
        <Html
          key={`continent-${p.name}`}
          position={p.position}
          occlude={[globeRef as RefObject<Object3D>]}
          sprite
          center
          pointerEvents="none"
          style={{ pointerEvents: 'none', zIndex: 20 }}
        >
          <span className="map-label map-label-continent">{p.name}</span>
        </Html>
      ))}
      {visibleCountries.map((p) => (
        <Html
          key={`country-${p.name}`}
          position={p.position}
          occlude={[globeRef as RefObject<Object3D>]}
          sprite
          center
          pointerEvents="none"
          style={{ pointerEvents: 'none', zIndex: 20 }}
        >
          <span className="map-label map-label-country">{p.name.toLowerCase()}</span>
        </Html>
      ))}
    </group>
  )
}
