import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { MathUtils, Spherical, Vector3 } from 'three'
import type { Mesh } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { GLOBE_RADIUS } from '../constants'
import { latLngToVector3, shortestAngle } from '../geo'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import type { Pin } from '../types'
import { Atmosphere, GlobeCore } from './Globe'
import { Labels } from './Labels'
import { LatLongGrid } from './LatLongGrid'
import { loadLandAssets, type LandAssets } from './land'
import { MapLines } from './MapLines'
import { Pins } from './Pins'
import { PreviewPin } from './PreviewPin'
import { Starfield } from './Starfield'

type SceneProps = {
  pins: Pin[]
  focusPin: Pin | null
  bloomId: string | null
  youHandle: string | null
  previewLatLng: { lat: number; lng: number } | null
  onFocusSettled: () => void
  onSelect: (pin: Pin) => void
  onTapGlobe: (lat: number, lng: number) => void
  onMiss: () => void
}

function FocusCamera({
  pin,
  dragging,
  onSettled,
}: {
  pin: Pin | null
  dragging: boolean
  onSettled: () => void
}) {
  const { camera, controls } = useThree()
  const pinDir = useRef(new Vector3())
  const offset = useRef(new Vector3())
  const current = useRef(new Spherical())
  const goal = useRef(new Spherical())
  const settled = useRef(false)

  useEffect(() => {
    settled.current = false
  }, [pin?.id])

  useFrame((_, delta) => {
    if (!pin || dragging) return
    const orbit = controls as OrbitControlsImpl | null
    if (!orbit) return

    latLngToVector3(pin.lat, pin.lng, 1, pinDir.current)
    goal.current.setFromVector3(pinDir.current)

    offset.current.copy(camera.position).sub(orbit.target)
    current.current.setFromVector3(offset.current)
    const thetaGoal = shortestAngle(current.current.theta, goal.current.theta)
    current.current.theta = MathUtils.damp(current.current.theta, thetaGoal, 4.2, delta)
    current.current.phi = MathUtils.damp(current.current.phi, goal.current.phi, 4.2, delta)
    offset.current.setFromSpherical(current.current)
    camera.position.copy(orbit.target).add(offset.current)
    orbit.update()

    if (
      !settled.current &&
      Math.abs(current.current.theta - thetaGoal) < 0.02 &&
      Math.abs(current.current.phi - goal.current.phi) < 0.02
    ) {
      settled.current = true
      window.setTimeout(onSettled, 900)
    }
  })

  return null
}

function GlobeWorld({
  pins,
  focusPin,
  bloomId,
  youHandle,
  previewLatLng,
  onFocusSettled,
  onSelect,
  onTapGlobe,
}: Omit<SceneProps, 'onMiss'>) {
  const globeRef = useRef<Mesh>(null)
  const [dragging, setDragging] = useState(false)
  const [land, setLand] = useState<LandAssets | null>(null)
  const reducedMotion = usePrefersReducedMotion()
  const flareIndex = focusPin ? pins.findIndex((p) => p.id === focusPin.id) : -1

  useEffect(() => {
    let cancelled = false
    void loadLandAssets()
      .then((assets) => {
        if (!cancelled) setLand(assets)
      })
      .catch(() => {
        if (!cancelled) setLand(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <Starfield />
      <GlobeCore ref={globeRef} land={land?.texture ?? null} onTap={onTapGlobe} />
      <LatLongGrid radius={GLOBE_RADIUS} />
      {land ? <MapLines coasts={land.coasts} borders={land.borders} /> : null}
      {land ? (
        <Labels continents={land.labels.continents} countries={land.labels.countries} radius={GLOBE_RADIUS} />
      ) : null}
      <Atmosphere />
      <Pins
        pins={pins}
        globeRef={globeRef}
        reducedMotion={reducedMotion}
        flareIndex={flareIndex}
        bloomId={bloomId}
        youHandle={youHandle}
        onSelect={onSelect}
      />
      {previewLatLng ? <PreviewPin lat={previewLatLng.lat} lng={previewLatLng.lng} /> : null}
      <FocusCamera pin={focusPin} dragging={dragging} onSettled={onFocusSettled} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        autoRotate={!reducedMotion && !dragging && !focusPin}
        autoRotateSpeed={2 / 3}
        minDistance={2.15}
        maxDistance={4.6}
        minPolarAngle={0.28}
        maxPolarAngle={Math.PI - 0.28}
        onStart={() => setDragging(true)}
        onEnd={() => setDragging(false)}
      />
    </>
  )
}

export function GlobeCanvas({
  pins,
  focusPin,
  bloomId,
  youHandle,
  previewLatLng,
  onFocusSettled,
  onSelect,
  onTapGlobe,
  onMiss,
}: SceneProps) {
  return (
    <Canvas
      className="globe-canvas"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0.18, 3.28], fov: 40, near: 0.1, far: 80 }}
      onPointerMissed={onMiss}
    >
      <GlobeWorld
        pins={pins}
        focusPin={focusPin}
        bloomId={bloomId}
        youHandle={youHandle}
        previewLatLng={previewLatLng}
        onFocusSettled={onFocusSettled}
        onSelect={onSelect}
        onTapGlobe={onTapGlobe}
      />
    </Canvas>
  )
}
