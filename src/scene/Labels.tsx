import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, Sprite, SpriteMaterial } from 'three'
import { latLngToVector3 } from '../geo'
import type { MapLabel } from './land'

type LabelsProps = {
  continents: MapLabel[]
  countries: MapLabel[]
  radius: number
}

type RankedSprite = { sprite: Sprite; rank: number }

function skipRaycast() {}

// Labels are rasterized to a canvas texture and drawn on a Sprite, which
// costs nothing per frame: sprites always face the camera on their own, and
// the opaque globe hides the ones on the far side through the normal depth
// test. drei's <Html> was tried here and had to be abandoned -- with
// `occlude` it raycasts the globe once per label per frame, and since the
// globe auto-rotates, its "camera barely moved" early-out never fires. At
// ~180 labels against a 35k-triangle sphere that worked out to millions of
// triangle intersection tests every frame and made the whole site crawl.
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
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // The globe's lit hemisphere renders light grey/white, so plain white text
  // disappears into it there -- a dark stroke behind the fill keeps the
  // label readable against both the lit surface and the night side.
  ctx.lineJoin = 'round'
  ctx.lineWidth = fontPx * 0.22
  ctx.strokeStyle = `rgba(0, 0, 0, ${Math.min(1, opacity + 0.35)})`
  ctx.strokeText(text, width / 2, height / 2)
  ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, opacity + 0.3)})`
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
): RankedSprite[] {
  return labels.map((label) => {
    const { texture, aspect } = buildLabelTexture(bold ? label.name : label.name.toLowerCase(), fontPx, opacity, bold)
    const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
    const sprite = new Sprite(material)
    sprite.scale.set(worldHeight * aspect, worldHeight, 1)
    latLngToVector3(label.lat, label.lng, radius * 1.014, sprite.position)
    sprite.raycast = skipRaycast
    return { sprite, rank: label.rank }
  })
}

function disposeSprites(sprites: RankedSprite[]): void {
  for (const { sprite } of sprites) {
    const material = sprite.material as SpriteMaterial
    material.map?.dispose()
    material.dispose()
  }
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
    () => buildSprites(continents, radius, 96, 0.5, true, 0.16),
    [continents, radius],
  )
  const countrySprites = useMemo(
    () => buildSprites(countries, radius, 56, 0.4, false, 0.055),
    [countries, radius],
  )

  useEffect(() => () => disposeSprites(continentSprites), [continentSprites])
  useEffect(() => () => disposeSprites(countrySprites), [countrySprites])

  const maxRank = rankCutoff(distance)
  const visibleCountries = useMemo(
    () => countrySprites.filter((s) => s.rank <= maxRank),
    [countrySprites, maxRank],
  )

  return (
    <group>
      {continentSprites.map(({ sprite }, i) => (
        <primitive key={`continent-${i}`} object={sprite} />
      ))}
      {visibleCountries.map(({ sprite }, i) => (
        <primitive key={`country-${i}`} object={sprite} />
      ))}
    </group>
  )
}
