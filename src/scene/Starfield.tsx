import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'

export function Starfield({ count = 1400 }: { count?: number }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      const u = Math.random()
      const v = Math.random()
      const theta = 2 * Math.PI * u
      const phi = Math.acos(2 * v - 1)
      const r = 18 + Math.random() * 10
      const i3 = i * 3
      positions[i3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i3 + 1] = r * Math.cos(phi)
      positions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return geo
  }, [count])

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        color="#cfe4ff"
        size={0.028}
        sizeAttenuation
        transparent
        opacity={0.42}
        depthWrite={false}
      />
    </points>
  )
}
