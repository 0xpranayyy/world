import { formatCoords, latLngToVector3, placeLabel, type PlaceScope } from '../geo'
import { colorFromLongitude, SWEEP_HEX } from '../palette'
import type { Pin } from '../types'

type Vec = { x: number; y: number; z: number }

type Ring = [number, number][]

let landRingsPromise: Promise<Ring[]> | null = null

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n))
}

function norm(v: Vec): Vec {
  const l = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

function cross(a: Vec, b: Vec): Vec {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function rotate(v: Vec, axis: Vec, angle: number): Vec {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const d = v.x * axis.x + v.y * axis.y + v.z * axis.z
  return {
    x: v.x * c + (axis.y * v.z - axis.z * v.y) * s + axis.x * d * (1 - c),
    y: v.y * c + (axis.z * v.x - axis.x * v.z) * s + axis.y * d * (1 - c),
    z: v.z * c + (axis.x * v.y - axis.y * v.x) * s + axis.z * d * (1 - c),
  }
}

function alignTo(v: Vec, target: Vec): (p: Vec) => Vec {
  const a = norm(v)
  const b = norm(target)
  const ax = cross(a, b)
  const axLen = Math.hypot(ax.x, ax.y, ax.z)
  const dot = clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1)
  const angle = Math.acos(dot)
  if (axLen < 1e-6) {
    if (dot > 0) return (p) => p
    return (p) => rotate(p, { x: 0, y: 1, z: 0 }, Math.PI)
  }
  const axis = { x: ax.x / axLen, y: ax.y / axLen, z: ax.z / axLen }
  return (p) => rotate(p, axis, angle)
}

let logoImagePromise: Promise<HTMLImageElement | null> | null = null

function loadLogoImage(): Promise<HTMLImageElement | null> {
  if (!logoImagePromise) {
    logoImagePromise = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = '/world-logo.svg'
    })
  }
  return logoImagePromise
}

function loadLandRings(): Promise<Ring[]> {
  if (!landRingsPromise) {
    landRingsPromise = fetch('/geo/land-110m.geojson')
      .then((res) => res.json())
      .then((data: { features: { geometry: { type: string; coordinates: unknown } | null }[] }) => {
        const rings: Ring[] = []
        for (const feature of data.features) {
          const g = feature.geometry
          if (!g) continue
          const polygons =
            g.type === 'Polygon'
              ? [g.coordinates as Ring[]]
              : g.type === 'MultiPolygon'
                ? (g.coordinates as Ring[][])
                : []
          for (const polygon of polygons) {
            if (polygon[0]) rings.push(polygon[0])
          }
        }
        return rings
      })
      .catch(() => [])
  }
  return landRingsPromise
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function hash32(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function drawStars(ctx: CanvasRenderingContext2D, width: number, height: number, seed: string) {
  let n = hash32(seed)
  const next = () => {
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0
    return n / 0xffffffff
  }
  for (let i = 0; i < 140; i += 1) {
    const x = next() * width
    const y = next() * height
    const a = 0.12 + next() * 0.45
    const s = 0.6 + next() * 1.6
    ctx.fillStyle = `rgba(255,255,255,${a})`
    ctx.beginPath()
    ctx.arc(x, y, s, 0, Math.PI * 2)
    ctx.fill()
  }
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: number,
  size: number,
) {
  let s = size
  ctx.font = `${weight} ${s}px Inter, ui-sans-serif, system-ui, sans-serif`
  while (s > 28 && ctx.measureText(text).width > maxWidth) {
    s -= 2
    ctx.font = `${weight} ${s}px Inter, ui-sans-serif, system-ui, sans-serif`
  }
  return s
}

function drawGlobe(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  zoom: number,
  pin: Pin,
  transform: (p: Vec) => Vec,
  rings: Ring[],
) {
  const pinColor = `#${colorFromLongitude(pin.lng).getHexString()}`
  const scale = r * zoom

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r + 36, 0, Math.PI * 2)
  ctx.shadowColor = 'rgba(74, 134, 251, 0.42)'
  ctx.shadowBlur = 64
  ctx.fillStyle = '#000'
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()

  const fill = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.34, r * 0.08, cx, cy, r)
  fill.addColorStop(0, '#222430')
  fill.addColorStop(0.42, '#0c0d12')
  fill.addColorStop(1, '#030304')
  ctx.fillStyle = fill
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2)

  const shade = ctx.createLinearGradient(cx - r, cy, cx + r, cy)
  shade.addColorStop(0, 'rgba(0,0,0,0.55)')
  shade.addColorStop(0.45, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = shade
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2)

  const project = (lat: number, lng: number) => {
    const v = latLngToVector3(lat, lng, 1)
    const t = transform({ x: v.x, y: v.y, z: v.z })
    return {
      x: cx + t.x * scale,
      y: cy - t.y * scale,
      z: t.z,
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1.15
  for (let m = 0; m < 24; m += 1) {
    const lng = (m / 24) * 360 - 180
    ctx.beginPath()
    let drawing = false
    for (let i = 0; i <= 72; i += 1) {
      const lat = (i / 72) * 180 - 90
      const p = project(lat, lng)
      if (p.z < 0.04) {
        drawing = false
        continue
      }
      if (!drawing) {
        ctx.moveTo(p.x, p.y)
        drawing = true
      } else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
  }
  for (let p = 1; p <= 16; p += 1) {
    const lat = (p / 17) * 180 - 90
    ctx.beginPath()
    let drawing = false
    for (let i = 0; i <= 96; i += 1) {
      const lng = (i / 96) * 360 - 180
      const pt = project(lat, lng)
      if (pt.z < 0.04) {
        drawing = false
        continue
      }
      if (!drawing) {
        ctx.moveTo(pt.x, pt.y)
        drawing = true
      } else ctx.lineTo(pt.x, pt.y)
    }
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.32)'
  ctx.lineWidth = 1.45
  for (const ring of rings) {
    ctx.beginPath()
    let drawing = false
    for (let i = 0; i < ring.length; i += 1) {
      const [lng, lat] = ring[i]
      const pt = project(lat, lng)
      if (pt.z < 0.06) {
        drawing = false
        continue
      }
      if (!drawing) {
        ctx.moveTo(pt.x, pt.y)
        drawing = true
      } else ctx.lineTo(pt.x, pt.y)
    }
    ctx.stroke()
  }

  const pinPt = project(pin.lat, pin.lng)
  ctx.strokeStyle = pinColor
  ctx.globalAlpha = 0.85
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.moveTo(pinPt.x, pinPt.y)
  ctx.lineTo(pinPt.x, pinPt.y - 52)
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.shadowColor = pinColor
  ctx.shadowBlur = 28
  ctx.fillStyle = pinColor
  ctx.beginPath()
  ctx.arc(pinPt.x, pinPt.y, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(pinPt.x - 2.5, pinPt.y - 2.5, 3, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()

  const conic = ctx.createConicGradient(-Math.PI * 0.35, cx, cy)
  SWEEP_HEX.forEach((hex, i) => {
    conic.addColorStop(i / (SWEEP_HEX.length - 1), hex)
  })
  ctx.strokeStyle = conic
  ctx.lineWidth = 18
  ctx.beginPath()
  ctx.arc(cx, cy, r - 6, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 6
  ctx.globalAlpha = 0.4
  ctx.beginPath()
  ctx.arc(cx, cy, r + 12, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1

  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.arc(cx + r * 0.3, cy - r * 0.4, 4, 0, Math.PI * 2)
  ctx.fill()
}

const CARD_W = 1600
const CARD_H = 900

const SCOPE_ZOOM: Record<PlaceScope, number> = {
  city: 4.2,
  country: 1.85,
  continent: 1,
}

export async function renderShareCard(
  pin: Pin,
  opts: { count: number; placeCount: number; permalink: string; scope: PlaceScope },
): Promise<Blob> {
  await document.fonts.ready
  await Promise.all([
    document.fonts.load('600 92px Inter'),
    document.fonts.load('500 32px Inter'),
    document.fonts.load('400 24px Inter'),
  ]).catch(() => undefined)

  const [rings, logoImg] = await Promise.all([loadLandRings(), loadLogoImage()])
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  drawStars(ctx, CARD_W, CARD_H, pin.handle)

  const washA = ctx.createRadialGradient(0, 0, 40, 120, 80, 920)
  washA.addColorStop(0, 'rgba(72, 112, 255, 0.38)')
  washA.addColorStop(1, 'rgba(72, 112, 255, 0)')
  ctx.fillStyle = washA
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  const washB = ctx.createRadialGradient(CARD_W, CARD_H, 40, CARD_W - 80, CARD_H - 60, 880)
  washB.addColorStop(0, 'rgba(236, 60, 150, 0.3)')
  washB.addColorStop(1, 'rgba(236, 60, 150, 0)')
  ctx.fillStyle = washB
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 2
  roundRect(ctx, 40, 40, CARD_W - 80, CARD_H - 80, 40)
  ctx.stroke()

  const pinVec = latLngToVector3(pin.lat, pin.lng, 1)
  const transform = alignTo(
    { x: pinVec.x, y: pinVec.y, z: pinVec.z },
    { x: 0.12, y: 0.14, z: 0.98 },
  )

  drawGlobe(ctx, 470, 470, 310, SCOPE_ZOOM[opts.scope], pin, transform, rings)

  const place = placeLabel(pin, opts.scope)
  const people =
    opts.placeCount > 1 ? `${opts.placeCount} people in ${place}` : `first pin from ${place}`
  const pinColor = `#${colorFromLongitude(pin.lng).getHexString()}`
  const joined = new Date(pin.joinedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const textX = 880
  const textMax = CARD_W - textX - 88

  if (logoImg) {
    const logoH = 34
    const logoW = logoH * (logoImg.width / logoImg.height)
    ctx.drawImage(logoImg, textX, 128 - logoH / 2, logoW, logoH)
  } else {
    const orb = ctx.createConicGradient(2.2, textX + 12, 128)
    SWEEP_HEX.forEach((hex, i) => orb.addColorStop(i / (SWEEP_HEX.length - 1), hex))
    ctx.fillStyle = orb
    ctx.beginPath()
    ctx.arc(textX + 12, 128, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '600 28px Inter, ui-sans-serif, system-ui, sans-serif'
    ctx.fillText('world', textX + 36, 138)
  }

  ctx.fillStyle = 'rgba(255,255,255,0.48)'
  ctx.font = '500 24px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(`dropped a pin · ${opts.scope}`, textX, 320)

  ctx.fillStyle = '#fff'
  const handle = `@${pin.handle}`
  fitText(ctx, handle, textMax, 600, 84)
  ctx.fillText(handle, textX, 420)

  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  fitText(ctx, place, textMax, 500, 36)
  ctx.fillText(place, textX, 478)

  ctx.fillStyle = pinColor
  ctx.font = '500 24px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(people, textX, 528)

  ctx.fillStyle = 'rgba(255,255,255,0.38)'
  ctx.font = '400 22px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(`${formatCoords(pin.lat, pin.lng)}  ·  ${joined}`, textX, 572)

  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font = '500 20px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(`pin ${opts.count.toLocaleString()}`, textX, CARD_H - 88)
  ctx.fillText(opts.permalink.replace(/^https?:\/\//, ''), textX, CARD_H - 58)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => {
      if (next) resolve(next)
      else reject(new Error('could not export card'))
    }, 'image/png')
  })
  return blob
}

export function shareCaption(pin: Pin, siteUrl: string, scope: PlaceScope): string {
  // placeLabel resolves to the city, country or continent depending on which
  // the sharer picked in the card, so the post names their location at the
  // granularity they chose to reveal.
  const place = placeLabel(pin, scope)
  // Deliberately the bare site, not the sharer's own /@handle page: the link is
  // an invitation to the reader, and a profile URL would send them to someone
  // else's pin. The sharer's own URL still appears on the card image.
  return [
    `I believe in @world_xyz from ${place}`,
    '',
    'the solana prediction market is my favourite prediction market',
    `share yours world map pin here : ${siteUrl}`,
  ].join('\n')
}

export function tweetIntentUrl(caption: string): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(caption)}`
}

export async function copyPng(blob: Blob): Promise<boolean> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': Promise.resolve(blob) as unknown as Blob }),
      ])
      return true
    } catch {
      return false
    }
  }
}

