import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import type { Mesh } from 'three'
import { GLOBE_RADIUS, MAX_PINS, PIN_LIFT } from '../constants'
import { hashPhase, latLngToVector3, nearbyPins, shortLocation } from '../geo'
import { clusterCell, clusterPins, shouldCluster } from '../lib/cluster'
import { haptic } from '../lib/haptics'
import { colorFromLongitude } from '../palette'
import type { Pin } from '../types'
import {
  beamFragment,
  beamVertex,
  haloFragment,
  haloVertex,
  pinFragment,
  pinVertex,
} from './shaders'

const dummy = new Object3D()
const radial = new Vector3()
const yAxis = new Vector3(0, 1, 0)
const color = new Color()

function skipRaycast() {}

function makeInstanceAttrs(count: number) {
  const phase = new Float32Array(count)
  const index = new Float32Array(count)
  const born = new Float32Array(count)
  const you = new Float32Array(count)
  for (let i = 0; i < count; i += 1) {
    phase[i] = 0
    index[i] = i
    born[i] = 0
    you[i] = 0
  }
  return {
    phase: new InstancedBufferAttribute(phase, 1),
    index: new InstancedBufferAttribute(index, 1),
    born: new InstancedBufferAttribute(born, 1),
    you: new InstancedBufferAttribute(you, 1),
  }
}

function attachAttrs(
  geometry: SphereGeometry | CylinderGeometry,
  attrs: ReturnType<typeof makeInstanceAttrs>,
) {
  geometry.setAttribute('aPhase', attrs.phase)
  geometry.setAttribute('aIndex', attrs.index)
  geometry.setAttribute('aBorn', attrs.born)
  geometry.setAttribute('aYou', attrs.you)
}

type PinsProps = {
  pins: Pin[]
  globeRef: RefObject<Mesh | null>
  reducedMotion: boolean
  flareIndex: number
  bloomId: string | null
  youHandle: string | null
  onSelect: (pin: Pin) => void
}

export function Pins({
  pins,
  globeRef,
  reducedMotion,
  flareIndex,
  bloomId,
  youHandle,
  onSelect,
}: PinsProps) {
  const pointsRef = useRef<InstancedMesh>(null)
  const beamsRef = useRef<InstancedMesh>(null)
  const halosRef = useRef<InstancedMesh>(null)
  const clustersRef = useRef<InstancedMesh>(null)
  const [hover, setHover] = useState<{
    pin: Pin
    position: [number, number, number]
    neighbors: Pin[]
  } | null>(null)
  const [clusterHover, setClusterHover] = useState<{
    count: number
    position: [number, number, number]
  } | null>(null)
  const [distance, setDistance] = useState(3.28)
  const { camera } = useThree()
  const bornAt = useRef(new Map<string, number>())

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPulse: { value: reducedMotion ? 0 : 1 },
      uFlareIndex: { value: flareIndex },
      uFlare: { value: flareIndex >= 0 ? 1 : 0 },
    }),
    [],
  )

  const clustered = shouldCluster(pins.length, distance)
  const clusters = useMemo(
    () => (clustered ? clusterPins(pins, clusterCell(distance)) : []),
    [clustered, distance, pins],
  )
  const visiblePins = clustered ? [] : pins

  const { pointGeo, beamGeo, haloGeo, clusterGeo, pointMat, beamMat, haloMat, clusterMat } =
    useMemo(() => {
      const attrs = makeInstanceAttrs(MAX_PINS)
      const nextPointGeo = new SphereGeometry(0.022, 16, 12)
      const nextBeamGeo = new CylinderGeometry(0.0032, 0.009, 0.11, 8, 1, true)
      const nextHaloGeo = new SphereGeometry(0.052, 16, 12)
      const nextClusterGeo = new SphereGeometry(0.07, 16, 12)
      attachAttrs(nextPointGeo, attrs)
      attachAttrs(nextBeamGeo, attrs)
      attachAttrs(nextHaloGeo, attrs)
      attachAttrs(nextClusterGeo, attrs)

      const pointMat = new ShaderMaterial({
        uniforms,
        vertexShader: pinVertex,
        fragmentShader: pinFragment,
        toneMapped: false,
      })
      const beamMat = new ShaderMaterial({
        uniforms,
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
      const haloMat = new ShaderMaterial({
        uniforms,
        vertexShader: haloVertex,
        fragmentShader: haloFragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      })
      const clusterMat = new ShaderMaterial({
        uniforms,
        vertexShader: haloVertex,
        fragmentShader: haloFragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      })

      return {
        pointGeo: nextPointGeo,
        beamGeo: nextBeamGeo,
        haloGeo: nextHaloGeo,
        clusterGeo: nextClusterGeo,
        pointMat,
        beamMat,
        haloMat,
        clusterMat,
      }
    }, [uniforms])

  useEffect(() => {
    uniforms.uPulse.value = reducedMotion ? 0 : 1
  }, [reducedMotion, uniforms])

  useEffect(() => {
    uniforms.uFlareIndex.value = flareIndex
    if (flareIndex >= 0) uniforms.uFlare.value = 1
  }, [flareIndex, uniforms])

  useLayoutEffect(() => {
    const points = pointsRef.current
    const beams = beamsRef.current
    const halos = halosRef.current
    const clusterMesh = clustersRef.current
    if (!points || !beams || !halos || !clusterMesh) return

    const bornAttr = pointGeo.getAttribute('aBorn') as InstancedBufferAttribute
    const youAttr = pointGeo.getAttribute('aYou') as InstancedBufferAttribute
    const phaseAttr = pointGeo.getAttribute('aPhase') as InstancedBufferAttribute
    const now = uniforms.uTime.value

    const count = Math.min(visiblePins.length, MAX_PINS)
    for (let i = 0; i < count; i += 1) {
      const pin = visiblePins[i]
      latLngToVector3(pin.lat, pin.lng, 1, radial)
      color.copy(colorFromLongitude(pin.lng))
      if (youHandle && pin.handle === youHandle) color.lerp(new Color('#ffffff'), 0.35)

      dummy.position.copy(radial).multiplyScalar(GLOBE_RADIUS + PIN_LIFT)
      dummy.scale.setScalar(1)
      dummy.quaternion.identity()
      dummy.updateMatrix()
      points.setMatrixAt(i, dummy.matrix)
      halos.setMatrixAt(i, dummy.matrix)
      points.setColorAt(i, color)
      halos.setColorAt(i, color)

      dummy.position.copy(radial).multiplyScalar(GLOBE_RADIUS + PIN_LIFT + 0.05)
      dummy.quaternion.setFromUnitVectors(yAxis, radial)
      dummy.updateMatrix()
      beams.setMatrixAt(i, dummy.matrix)
      beams.setColorAt(i, color)

      phaseAttr.setX(i, hashPhase(pin.handle))
      if (bloomId === pin.id && !bornAt.current.has(pin.id)) {
        bornAt.current.set(pin.id, Math.max(now, 0.05))
      }
      bornAttr.setX(i, reducedMotion ? 0 : (bornAt.current.get(pin.id) ?? 0))
      youAttr.setX(i, youHandle && pin.handle === youHandle ? 1 : 0)
    }

    points.count = count
    beams.count = count
    halos.count = count
    points.instanceMatrix.needsUpdate = true
    beams.instanceMatrix.needsUpdate = true
    halos.instanceMatrix.needsUpdate = true
    if (points.instanceColor) points.instanceColor.needsUpdate = true
    if (beams.instanceColor) beams.instanceColor.needsUpdate = true
    if (halos.instanceColor) halos.instanceColor.needsUpdate = true
    bornAttr.needsUpdate = true
    youAttr.needsUpdate = true
    phaseAttr.needsUpdate = true

    const cCount = Math.min(clusters.length, MAX_PINS)
    for (let i = 0; i < cCount; i += 1) {
      const cluster = clusters[i]
      latLngToVector3(cluster.lat, cluster.lng, 1, radial)
      color.copy(colorFromLongitude(cluster.lng))
      const scale = 1 + Math.min(2.2, Math.log2(cluster.count + 1) * 0.45)
      dummy.position.copy(radial).multiplyScalar(GLOBE_RADIUS + PIN_LIFT + 0.02)
      dummy.scale.setScalar(scale)
      dummy.quaternion.identity()
      dummy.updateMatrix()
      clusterMesh.setMatrixAt(i, dummy.matrix)
      clusterMesh.setColorAt(i, color)
    }
    clusterMesh.count = cCount
    clusterMesh.instanceMatrix.needsUpdate = true
    if (clusterMesh.instanceColor) clusterMesh.instanceColor.needsUpdate = true
  }, [bloomId, clusters, pointGeo, reducedMotion, uniforms, visiblePins, youHandle])

  useFrame((state, delta) => {
    uniforms.uTime.value = state.clock.elapsedTime
    if (uniforms.uFlare.value > 0) {
      uniforms.uFlare.value = Math.max(0, uniforms.uFlare.value - delta * 0.85)
    }
    const next = state.camera.position.length()
    if (Math.abs(next - distance) > 0.08) setDistance(next)
  })

  return (
    <group>
      <instancedMesh
        ref={halosRef}
        args={[haloGeo, haloMat, MAX_PINS]}
        frustumCulled={false}
        raycast={skipRaycast}
      />
      <instancedMesh
        ref={beamsRef}
        args={[beamGeo, beamMat, MAX_PINS]}
        frustumCulled={false}
        raycast={skipRaycast}
      />
      <instancedMesh
        ref={pointsRef}
        args={[pointGeo, pointMat, MAX_PINS]}
        frustumCulled={false}
        visible={!clustered}
        onPointerMove={(event) => {
          event.stopPropagation()
          if (event.instanceId == null) return
          const pin = visiblePins[event.instanceId]
          if (!pin) return
          latLngToVector3(pin.lat, pin.lng, GLOBE_RADIUS + PIN_LIFT + 0.06, radial)
          setHover({
            pin,
            position: [radial.x, radial.y, radial.z],
            neighbors: nearbyPins(pin, pins),
          })
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(null)
          document.body.style.cursor = 'auto'
        }}
        onClick={(event) => {
          event.stopPropagation()
          if (event.instanceId == null) return
          const pin = visiblePins[event.instanceId]
          if (pin) {
            haptic('select')
            onSelect(pin)
          }
        }}
      />
      <instancedMesh
        ref={clustersRef}
        args={[clusterGeo, clusterMat, MAX_PINS]}
        frustumCulled={false}
        visible={clustered}
        onPointerMove={(event) => {
          event.stopPropagation()
          if (event.instanceId == null) return
          const cluster = clusters[event.instanceId]
          if (!cluster) return
          latLngToVector3(cluster.lat, cluster.lng, GLOBE_RADIUS + PIN_LIFT + 0.08, radial)
          setClusterHover({
            count: cluster.count,
            position: [radial.x, radial.y, radial.z],
          })
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setClusterHover(null)
          document.body.style.cursor = 'auto'
        }}
        onClick={(event) => {
          event.stopPropagation()
          if (event.instanceId == null) return
          const cluster = clusters[event.instanceId]
          if (!cluster) return
          haptic('select')
          if (cluster.count === 1) onSelect(cluster.pins[0])
          else onSelect(cluster.pins[0])
          camera.position.multiplyScalar(0.86)
        }}
      />
      {hover && !clustered ? (
        <Html
          position={hover.position}
          occlude={[globeRef as RefObject<Object3D>]}
          sprite
          center
          pointerEvents="none"
          style={{ pointerEvents: 'none' }}
        >
          <div className="pin-label">
            <span className="pin-label-name">
              @{hover.pin.handle}
              {youHandle === hover.pin.handle ? ' · you' : ''}
            </span>
            <span className="pin-label-place">{shortLocation(hover.pin.locationName)}</span>
            {hover.neighbors.length > 0 ? (
              <span className="pin-label-place">
                also {hover.neighbors.map((n) => `@${n.handle}`).join(', ')}
              </span>
            ) : null}
          </div>
        </Html>
      ) : null}
      {clusterHover && clustered ? (
        <Html
          position={clusterHover.position}
          sprite
          center
          pointerEvents="none"
          style={{ pointerEvents: 'none' }}
        >
          <div className="pin-label">
            <span className="pin-label-name">{clusterHover.count} pins</span>
            <span className="pin-label-place">scroll or tap to open</span>
          </div>
        </Html>
      ) : null}
    </group>
  )
}
