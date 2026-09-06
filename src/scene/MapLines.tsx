import { useMemo } from 'react'
import type { BufferGeometry } from 'three'
import { GLOBE_RADIUS } from '../constants'

export function MapLines({
  coasts,
  borders,
  radius = GLOBE_RADIUS,
}: {
  coasts: BufferGeometry
  borders: BufferGeometry
  radius?: number
}) {
  const coastScale = useMemo(() => radius, [radius])

  return (
    <group scale={coastScale}>
      <lineSegments geometry={borders} frustumCulled={false}>
        <lineBasicMaterial
          color="#dce7ff"
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={coasts} frustumCulled={false}>
        <lineBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.34}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  )
}
