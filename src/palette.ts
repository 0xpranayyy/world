import { Color } from 'three'
import { wrapLng } from './geo'

export const SWEEP_HEX = [
  '#6f4dff',
  '#4a86fb',
  '#22cfe4',
  '#7fe9c6',
  '#fdeaa4',
  '#fff8e4',
  '#fbaa7c',
  '#f45d9e',
  '#dc1f96',
] as const

const stops = SWEEP_HEX.map((hex) => new Color(hex))

export function colorFromLongitude(lng: number): Color {
  let t = (wrapLng(lng) + 180) / 360
  t = ((t % 1) + 1) % 1
  const scaled = t * (stops.length - 1)
  const i0 = Math.min(stops.length - 1, Math.max(0, Math.floor(scaled)))
  const i1 = Math.min(i0 + 1, stops.length - 1)
  const f = scaled - i0
  return stops[i0].clone().lerp(stops[i1], f)
}

export function hexToVec3Literal(hex: string): string {
  const c = new Color(hex)
  const fmt = (n: number) => n.toFixed(3)
  return `vec3(${fmt(c.r)}, ${fmt(c.g)}, ${fmt(c.b)})`
}
