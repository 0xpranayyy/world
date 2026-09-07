import { useFrame } from '@react-three/fiber'
import { useMemo, useState } from 'react'
import { CanvasTexture } from 'three'
import { latLngToVector3 } from '../geo'
import type { MapLabel } from './land'

type LabelsProps = {
  continents: MapLabel[]
  countries: MapLabel[]
  radius: number
}

type LabelSprite = {
  key: string
  rank: number
  position: [number, number, number]
  texture: CanvasTexture
  width: number
  height: number
}

function skipRaycast() {}

// Labels are rasterized to a canvas texture and drawn on a Sprite (always
// faces the camera, no orientation math needed) rather than using drei's
// Text/troika, which loads its glyph font asynchronously and suspends the
// whole Canvas tree while doing it -- verified live that this blanked the
// entire globe, not just the labels, since nothing wrapped that suspension
// tightly enough to keep it from bubbling up past the lazy-loaded scene's
// own Suspense boundary. Canvas 2D text has no such loading step.
function buildLabelTexture(
  text: string,
  fontPx: number,
  opacity: number,
  bold: boolean,
): { texture: CanvasTexture; aspect: number } {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const font = `${bold ? 600 : 400} ${fontPx}px Inter, ui-sans-serif, system-ui, sans-serif`
  if (!ctx) {
    canvas.width = 1
    canvas.height = 1
    return { texture: new CanvasTexture(canvas), aspect: 1 }
  }
  ctx.font = font
  const paddingX = fontPx * 0.5
  const width = Math.max(1, Math.ceil(ctx.measureText(text).width + paddingX * 2))
  const height = Math.ceil(fontPx * 1.7)
  canvas.width = width
  canvas.height = height
  // Resizing the canvas resets context state, so the font has to be reapplied.
  ctx.font = font
  ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, width / 2, height / 2)
  const texture = new CanvasTexture(canvas)
  texture.needsUpdate = true
  return { texture, aspect: width / height }
}

function buildSprites(
  labels: MapLabel[],
  radius: number,
  fontPx: number,
  opacity: number,
  bold: boolean,
  worldHeight: number,
): LabelSprite[] {
  return labels.map((label) => {
    const { texture, aspect } = buildLabelTexture(bold ? label.name : label.name.toLowerCase(), fontPx, opacity, bold)
    const p = latLngToVector3(label.lat, label.lng, radius * 1.014)
    return {
      key: label.name,
      rank: label.rank,
      position: [p.x, p.y, p.z],
      texture,
      width: worldHeight * aspect,
      height: worldHeight,
    }
  })
}

// Fewer, bigger-country labels when zoomed out; more detail reveals itself
// as the camera gets closer, the same zoom-tiered idea as pin clustering in
// lib/cluster.ts (MapLabel.rank comes from Natural Earth's own LABELRANK,
// so "bigger/more important" is already baked into the data).
function rankCutoff(distance: number): number {
  if (distance > 4.05) return 2
  if (distance > 3.45) return 3
  return 7
}

export function Labels({ continents, countries, radius }: LabelsProps) {
  const [distance, setDistance] = useState(3.28)

  useFrame((state) => {
    const next = state.camera.position.length()
    if (Math.abs(next - distance) > 0.08) setDistance(next)
  })

  const continentSprites = useMemo(
    () => buildSprites(continents, radius, 64, 0.5, true, 0.09),
    [continents, radius],
  )
  const countrySprites = useMemo(
    () => buildSprites(countries, radius, 40, 0.4, false, 0.032),
    [countries, radius],
  )

  const maxRank = rankCutoff(distance)
  const visibleCountries = useMemo(
    () => countrySprites.filter((s) => s.rank <= maxRank),
    [countrySprites, maxRank],
  )

  return (
    <group>
      {continentSprites.map((s) => (
        <sprite key={`continent-${s.key}`} position={s.position} scale={[s.width, s.height, 1]} raycast={skipRaycast}>
          <spriteMaterial map={s.texture} transparent depthWrite={false} />
        </sprite>
      ))}
      {visibleCountries.map((s) => (
        <sprite key={`country-${s.key}`} position={s.position} scale={[s.width, s.height, 1]} raycast={skipRaycast}>
          <spriteMaterial map={s.texture} transparent depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}
