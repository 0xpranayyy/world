import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import { GLOBE_RADIUS, PIN_LIFT } from '../constants'
import { latLngToVector3 } from '../geo'

type PreviewPinProps = {
  lat: number
  lng: number
}

const POP_DURATION = 0.32

export function PreviewPin({ lat, lng }: PreviewPinProps) {
  const groupRef = useRef<Group>(null)
  const ringRef = useRef<Mesh>(null)
  const age = useRef(0)

  const position = useMemo(
    () => latLngToVector3(lat, lng, GLOBE_RADIUS + PIN_LIFT + 0.03, new Vector3()),
    [lat, lng],
  )

  useFrame((state, delta) => {
    age.current += delta
    const t = Math.min(1, age.current / POP_DURATION)
    // overshoot-and-settle pop so the marker feels dropped, not just faded in
    const pop = t < 1 ? 1 + Math.sin(t * Math.PI) * 0.5 * (1 - t) : 1
    groupRef.current?.scale.setScalar(t * pop)

    const pulse = (state.clock.elapsedTime % 1.4) / 1.4
    if (ringRef.current) {
      ringRef.current.scale.setScalar(1 + pulse * 2.2)
      const material = ringRef.current.material as MeshBasicMaterial
      material.opacity = (1 - pulse) * 0.55
    }
  })

  return (
    <group position={position}>
      <group ref={groupRef}>
        <mesh>
          <sphereGeometry args={[0.028, 20, 20]} />
          <meshBasicMaterial color="#7fe9c6" />
        </mesh>
      </group>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.026, 0.034, 32]} />
        <meshBasicMaterial color="#7fe9c6" transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  )
}
