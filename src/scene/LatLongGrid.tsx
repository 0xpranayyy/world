import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { GLOBE_RADIUS } from '../constants'
import { latLngToVector3 } from '../geo'

function createLatLongGeometry(
  radius: number,
  meridians = 24,
  parallels = 16,
  segments = 128,
): BufferGeometry {
  const positions: number[] = []
  const a = latLngToVector3(0, 0, radius)
  const b = latLngToVector3(0, 0, radius)

  for (let m = 0; m < meridians; m += 1) {
    const lng = (m / meridians) * 360 - 180
    for (let i = 0; i < segments; i += 1) {
      const lat0 = (i / segments) * 180 - 90
      const lat1 = ((i + 1) / segments) * 180 - 90
      latLngToVector3(lat0, lng, radius, a)
      latLngToVector3(lat1, lng, radius, b)
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }

  for (let p = 1; p <= parallels; p += 1) {
    const lat = (p / (parallels + 1)) * 180 - 90
    for (let i = 0; i < segments; i += 1) {
      const lng0 = (i / segments) * 360 - 180
      const lng1 = ((i + 1) / segments) * 360 - 180
      latLngToVector3(lat, lng0, radius, a)
      latLngToVector3(lat, lng1, radius, b)
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

export function LatLongGrid({ radius = GLOBE_RADIUS }: { radius?: number }) {
  const geometry = useMemo(() => createLatLongGeometry(radius * 1.0018), [radius])

  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.09}
        depthWrite={false}
      />
    </lineSegments>
  )
}
