import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Quaternion, Vector3 } from 'three'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import { GLOBE_RADIUS, PIN_LIFT } from '../constants'
import { latLngToVector3 } from '../geo'

type PreviewPinProps = {
  lat: number
  lng: number
}

const POP_DURATION = 0.32
const COLOR = '#7fe9c6'
const yAxis = new Vector3(0, 1, 0)

export function PreviewPin({ lat, lng }: PreviewPinProps) {
  const groupRef = useRef<Group>(null)
  const haloRef = useRef<Mesh>(null)
  const ringRef = useRef<Mesh>(null)
  const age = useRef(0)

  const { position, quaternion } = useMemo(() => {
    const radial = latLngToVector3(lat, lng, 1, new Vector3())
    return {
      position: radial.clone().multiplyScalar(GLOBE_RADIUS + PIN_LIFT + 0.03),
      quaternion: new Quaternion().setFromUnitVectors(yAxis, radial),
    }
  }, [lat, lng])

  useFrame((state, delta) => {
    age.current += delta
    const t = Math.min(1, age.current / POP_DURATION)
    // overshoot-and-settle pop so the marker feels dropped, not just faded in
    const pop = t < 1 ? 1 + Math.sin(t * Math.PI) * 0.5 * (1 - t) : 1
    groupRef.current?.scale.setScalar(t * pop)

    const breathe = 1 + Math.sin(state.clock.elapsedTime * 3.2) * 0.12
    haloRef.current?.scale.setScalar(breathe)

    const pulse = (state.clock.elapsedTime % 1.4) / 1.4
    if (ringRef.current) {
      ringRef.current.scale.setScalar(1 + pulse * 2.6)
      const material = ringRef.current.material as MeshBasicMaterial
      material.opacity = (1 - pulse) * 0.6
    }
  })

  return (
    <group position={position} quaternion={quaternion}>
      <group ref={groupRef}>
        <mesh>
          <sphereGeometry args={[0.03, 20, 20]} />
          <meshBasicMaterial color={COLOR} />
        </mesh>
        <mesh ref={haloRef}>
          <sphereGeometry args={[0.062, 20, 20]} />
          <meshBasicMaterial color={COLOR} transparent opacity={0.35} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.075, 0]}>
          <cylinderGeometry args={[0.004, 0.013, 0.15, 12, 1, true]} />
          <meshBasicMaterial
            color={COLOR}
            transparent
            opacity={0.4}
            blending={AdditiveBlending}
            depthWrite={false}
            side={2}
          />
        </mesh>
      </group>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.03, 0.04, 32]} />
        <meshBasicMaterial color={COLOR} transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </group>
  )
}
