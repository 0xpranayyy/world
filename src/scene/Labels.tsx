import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three'
import { latLngToVector3 } from '../geo'
import type { MapLabel } from './land'

type LabelsProps = {
  continents: MapLabel[]
  countries: MapLabel[]
  radius: number
}

type LabelSprite = {
  sprite: Sprite
  material: SpriteMaterial
  rank: number
  /** Unit vector from the globe's centre out to the label, cached for the limb fade. */
  direction: Vector3
  baseOpacity: number
}

function skipRaycast() {}

type LabelStyle = {
  /** Canvas font size. Only affects texture crispness, not on-screen size. */
  fontPx: number
  /** Cap height of the text as a fraction of viewport height, e.g. 0.018 ≈ 14px at 800px tall. */
  textFraction: number
  opacity: number
  bold: boolean
  tracking: number
}

/**
 * The rasterised bitmap is this many times taller than its font size, to leave
 * room for the halo. The glyphs therefore only fill part of the sprite, so the
 * sprite has to be scaled up by this factor for the *text* to land at the
 * requested size -- getting this wrong is what made the first attempt render
 * ~5px tall and unreadable.
 */
const TEXTURE_HEIGHT_EM = 1.5

const CONTINENT_STYLE: LabelStyle = { fontPx: 128, textFraction: 0.034, opacity: 0.85, bold: true, tracking: 0.18 }
const COUNTRY_STYLE: LabelStyle = { fontPx: 96, textFraction: 0.018, opacity: 0.95, bold: false, tracking: 0.02 }

// Text is rasterised to a canvas texture and drawn on a Sprite. Sprites cost
// nothing per frame -- they face the camera on their own, and the opaque
// globe hides far-side labels through the normal depth test. (drei's <Html
// occlude> was tried here and raycast the globe once per label per frame,
// which measured ~145ms/frame across ~184 labels and pinned the site at
// ~7fps. Never reintroduce it.)
function buildLabelTexture(text: string, style: LabelStyle): { texture: CanvasTexture; aspect: number } {
  const { fontPx, bold, tracking } = style
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const font = `${bold ? 600 : 500} ${fontPx}px Inter, ui-sans-serif, system-ui, sans-serif`
  if (!ctx) {
    canvas.width = 1
    canvas.height = 1
    return { texture: new CanvasTexture(canvas), aspect: 1 }
  }

  const letterSpacing = `${(fontPx * tracking).toFixed(2)}px`
  ctx.font = font
  ctx.letterSpacing = letterSpacing
  // Pad enough for the halo and the last letter's tracking to overhang without
  // being clipped, but no more -- padding is dead space that shrinks the
  // glyphs relative to the sprite.
  const padding = fontPx * 0.35
  const width = Math.max(1, Math.ceil(ctx.measureText(text).width + padding * 2))
  const height = Math.ceil(fontPx * TEXTURE_HEIGHT_EM)
  canvas.width = width
  canvas.height = height

  // Resizing the canvas resets every context property, so restate them all.
  ctx.font = font
  ctx.letterSpacing = letterSpacing
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const cx = width / 2
  const cy = height / 2

  // The globe's lit hemisphere is near-white and its night side is near-black,
  // so the text needs to carry its own contrast either way: a soft dark glow
  // for separation, then a tight dark stroke for edge definition, then the
  // white fill on top.
  // Keep the dark treatment light: at ~14px on screen a heavy halo swallows
  // the glyphs entirely and the label reads as a grey smudge.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'
  ctx.shadowBlur = fontPx * 0.16
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  ctx.lineWidth = fontPx * 0.1
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.strokeText(text, cx, cy)
  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, cx, cy)

  const texture = new CanvasTexture(canvas)
  // Text bitmaps are only ever minified here; a linear filter without mipmaps
  // keeps strokes from smearing away at small on-screen sizes.
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return { texture, aspect: width / height }
}

/**
 * With sizeAttenuation:false a sprite's on-screen height is `scale / (2 *
 * tan(fov/2))` of the viewport, independent of distance. Inverting that gives
 * the scale needed for a requested on-screen size. Derived from the live
 * camera rather than hardcoded so it can't drift out of sync with the scene.
 */
function scaleForScreenFraction(fraction: number, fovDegrees: number): number {
  return fraction * 2 * Math.tan((fovDegrees * Math.PI) / 180 / 2)
}

function buildSprites(
  labels: MapLabel[],
  radius: number,
  style: LabelStyle,
  fovDegrees: number,
): LabelSprite[] {
  // The glyphs only occupy 1/TEXTURE_HEIGHT_EM of the bitmap, so the sprite
  // has to be that much larger for the text itself to hit textFraction.
  const spriteFraction = style.textFraction * TEXTURE_HEIGHT_EM
  const screenScale = scaleForScreenFraction(spriteFraction, fovDegrees)
  return labels.map((label) => {
    const text = style.bold ? label.name.toUpperCase() : label.name.toLowerCase()
    const { texture, aspect } = buildLabelTexture(text, style)
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      // Constant on-screen size at any zoom -- without this labels shrink to
      // noise when zoomed out and blow up when zoomed in.
      sizeAttenuation: false,
      opacity: style.opacity,
      toneMapped: false,
    })
    const sprite = new Sprite(material)
    sprite.scale.set(screenScale * aspect, screenScale, 1)
    latLngToVector3(label.lat, label.lng, radius * 1.02, sprite.position)
    sprite.raycast = skipRaycast
    sprite.renderOrder = 10
    return {
      sprite,
      material,
      rank: label.rank,
      direction: sprite.position.clone().normalize(),
      baseOpacity: style.opacity,
    }
  })
}

function disposeSprites(sprites: LabelSprite[]): void {
  for (const { material } of sprites) {
    material.map?.dispose()
    material.dispose()
  }
}

// Fewer, bigger-country labels when zoomed out; more detail as the camera
// closes in -- the same zoom-tiered idea as pin clustering in lib/cluster.ts.
// rank is Natural Earth's own LABELRANK, so "more important" is already in
// the data.
function rankCutoff(distance: number): number {
  if (distance > 4.05) return 2
  if (distance > 3.6) return 3
  if (distance > 3.0) return 4
  return 6
}

// Labels crowd together and overlap as they approach the globe's silhouette,
// where the surface is nearly edge-on. Fading them out across that band reads
// far cleaner than letting them pile up on the rim.
const FADE_START = 0.12
const FADE_FULL = 0.42

export function Labels({ continents, countries, radius }: LabelsProps) {
  const [distance, setDistance] = useState(3.28)

  const camera = useThree((state) => state.camera)
  const fov = 'fov' in camera ? (camera.fov as number) : 40

  const continentSprites = useMemo(
    () => buildSprites(continents, radius, CONTINENT_STYLE, fov),
    [continents, radius, fov],
  )
  const countrySprites = useMemo(
    () => buildSprites(countries, radius, COUNTRY_STYLE, fov),
    [countries, radius, fov],
  )

  useEffect(() => () => disposeSprites(continentSprites), [continentSprites])
  useEffect(() => () => disposeSprites(countrySprites), [countrySprites])

  const maxRank = rankCutoff(distance)
  const visibleCountries = useMemo(
    () => countrySprites.filter((s) => s.rank <= maxRank),
    [countrySprites, maxRank],
  )

  const camDir = useMemo(() => new Vector3(), [])

  useFrame((state) => {
    const next = state.camera.position.length()
    if (Math.abs(next - distance) > 0.08) setDistance(next)

    // One dot product per label per frame -- a few microseconds in total, and
    // it buys the limb fade without going anywhere near a raycast.
    camDir.copy(state.camera.position).normalize()
    for (const label of continentSprites) applyFade(label, camDir)
    for (const label of visibleCountries) applyFade(label, camDir)
  })

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

function applyFade(label: LabelSprite, camDir: Vector3): void {
  const facing = label.direction.dot(camDir)
  const t = (facing - FADE_START) / (FADE_FULL - FADE_START)
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)
  label.material.opacity = label.baseOpacity * clamped
  label.sprite.visible = clamped > 0.01
}
