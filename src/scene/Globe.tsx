import { useFrame } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BackSide,
  DataTexture,
  ShaderMaterial,
  Vector3,
} from 'three'
import type { Mesh, Texture } from 'three'
import { GLOBE_RADIUS } from '../constants'
import { sunDirection, vector3ToLatLng } from '../geo'
import { atmosphereFragment, atmosphereVertex, globeFragment, globeVertex } from './shaders'

function emptyLand(): DataTexture {
  const tex = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  tex.needsUpdate = true
  return tex
}

const sun = new Vector3(0.4, 0.3, 0.85)

export const GlobeCore = forwardRef<
  Mesh,
  {
    radius?: number
    land?: Texture | null
    onTap?: (lat: number, lng: number) => void
  }
>(function GlobeCore({ radius = GLOBE_RADIUS, land = null, onTap }, ref) {
  const fallback = useMemo(() => emptyLand(), [])
  const down = useRef<{ x: number; y: number } | null>(null)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uLand: { value: fallback },
          uSun: { value: sun.clone() },
        },
        vertexShader: globeVertex,
        fragmentShader: globeFragment,
        toneMapped: false,
      }),
    [fallback],
  )

  useEffect(() => {
    material.uniforms.uLand.value = land ?? fallback
  }, [fallback, land, material])

  useFrame(() => {
    sunDirection(new Date(), material.uniforms.uSun.value as Vector3)
  })

  return (
    <mesh
      ref={ref}
      material={material}
      onPointerDown={(event) => {
        down.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerUp={(event) => {
        if (!onTap || !down.current) return
        const dx = event.clientX - down.current.x
        const dy = event.clientY - down.current.y
        down.current = null
        if (Math.hypot(dx, dy) > 8) return
        const { lat, lng } = vector3ToLatLng(event.point)
        onTap(lat, lng)
      }}
    >
      <sphereGeometry args={[radius, 160, 112]} />
    </mesh>
  )
})

export function Atmosphere({ radius = GLOBE_RADIUS }: { radius?: number }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: atmosphereVertex,
        fragmentShader: atmosphereFragment,
        side: BackSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )

  return (
    <mesh material={material} scale={1.09}>
      <sphereGeometry args={[radius, 80, 56]} />
    </mesh>
  )
}
