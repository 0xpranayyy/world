import { hexToVec3Literal, SWEEP_HEX } from '../palette'

const paletteFn = `
vec3 pal(int i) {
  if (i == 0) return ${hexToVec3Literal(SWEEP_HEX[0])};
  if (i == 1) return ${hexToVec3Literal(SWEEP_HEX[1])};
  if (i == 2) return ${hexToVec3Literal(SWEEP_HEX[2])};
  if (i == 3) return ${hexToVec3Literal(SWEEP_HEX[3])};
  if (i == 4) return ${hexToVec3Literal(SWEEP_HEX[4])};
  if (i == 5) return ${hexToVec3Literal(SWEEP_HEX[5])};
  if (i == 6) return ${hexToVec3Literal(SWEEP_HEX[6])};
  if (i == 7) return ${hexToVec3Literal(SWEEP_HEX[7])};
  return ${hexToVec3Literal(SWEEP_HEX[8])};
}

vec3 sampleSweep(float t) {
  t = fract(t);
  float scaled = t * 8.0;
  int i0 = int(floor(scaled));
  int i1 = int(mod(float(i0 + 1), 9.0));
  float f = fract(scaled);
  f = f * f * (3.0 - 2.0 * f);
  return mix(pal(i0), pal(i1), f);
}
`

export const globeVertex = `
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`

export const globeFragment = `
uniform sampler2D uLand;
uniform vec3 uSun;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;

${paletteFn}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 vn = normalize(vViewNormal);
  vec3 p = normalize(vWorldPosition);

  float theta = atan(p.z, -p.x);
  float u = theta / 6.28318530718;
  if (u < 0.0) u += 1.0;
  float v = acos(clamp(p.y, -1.0, 1.0)) / 3.14159265359;
  float land = texture2D(uLand, vec2(u, v)).r;
  float coast = smoothstep(0.08, 0.42, land) * (1.0 - smoothstep(0.52, 0.92, land));

  float ndotv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndotv, 2.55);
  float inner = pow(1.0 - ndotv, 5.2);

  float angle = atan(vn.y, vn.x);
  float sweepT = angle / 6.28318530718 + 0.5;
  sweepT += vn.z * 0.04;
  vec3 sweep = sampleSweep(sweepT);

  vec3 ocean = vec3(0.008, 0.010, 0.016);
  vec3 terrain = vec3(0.10, 0.11, 0.14);
  vec3 core = mix(ocean, terrain, land);

  vec3 lightDir = normalize(vec3(0.55, 0.82, 0.42));
  vec3 fillDir = normalize(vec3(-0.45, 0.15, -0.3));
  vec3 H = normalize(lightDir + V);
  float spec = pow(clamp(dot(N, H), 0.0, 1.0), 64.0) * 0.28;
  float glint = pow(clamp(dot(N, H), 0.0, 1.0), 380.0);
  float fill = pow(clamp(dot(N, fillDir), 0.0, 1.0), 2.0) * 0.08;

  vec3 color = core;
  float sunLit = dot(N, normalize(uSun));
  float day = smoothstep(-0.12, 0.16, sunLit);
  color *= mix(vec3(0.28, 0.30, 0.40), vec3(1.0), day);
  color += land * (1.0 - day) * vec3(0.05, 0.055, 0.08);
  color += sweep * fresnel * (1.05 + land * 0.22);
  color += sweep * inner * 0.32;
  color += sweep * coast * 0.55;
  color += land * vec3(0.07, 0.08, 0.10) * ndotv;
  color += spec * mix(sweep, vec3(1.0), 0.45);
  color += vec3(1.0) * glint;
  color += fill * sweep;

  gl_FragColor = vec4(color, 1.0);
}
`

export const atmosphereVertex = `
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

export const atmosphereFragment = `
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec3 vWorldPosition;

${paletteFn}

void main() {
  vec3 N = normalize(-vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 vn = normalize(vViewNormal);

  float rim = pow(1.0 - abs(dot(N, V)), 2.1);
  float band = smoothstep(0.12, 0.82, rim);

  float angle = atan(vn.y, vn.x);
  float sweepT = angle / 6.28318530718 + 0.5;
  vec3 sweep = sampleSweep(sweepT);

  vec3 color = sweep * band * 1.4;
  float alpha = band * 0.85;
  gl_FragColor = vec4(color, alpha);
}
`

export const pinVertex = `
attribute float aPhase;
attribute float aIndex;
attribute float aBorn;
attribute float aYou;
uniform float uTime;
uniform float uPulse;
uniform float uFlareIndex;
uniform float uFlare;
varying vec3 vColor;
varying float vGlow;

void main() {
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif

  float pulse = 1.0 + 0.14 * sin(uTime * 1.65 + aPhase) * uPulse;
  float flare = abs(aIndex - uFlareIndex) < 0.5 ? uFlare : 0.0;
  float age = max(uTime - aBorn, 0.0);
  float grow = aBorn < 0.02 ? 1.0 : min(1.0, 1.0 - exp(-age * 3.4));
  vGlow = pulse + flare * 2.4 + aYou * 0.35;

  vec3 transformed = position * (0.82 + 0.18 * vGlow) * grow * (1.0 + aYou * 0.22);
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`

export const pinFragment = `
varying vec3 vColor;
varying float vGlow;

void main() {
  vec3 color = vColor * (0.75 + vGlow * 0.55);
  gl_FragColor = vec4(color, 1.0);
}
`

export const haloVertex = `
attribute float aPhase;
attribute float aIndex;
attribute float aBorn;
attribute float aYou;
uniform float uTime;
uniform float uPulse;
uniform float uFlareIndex;
uniform float uFlare;
varying vec3 vColor;
varying float vAlpha;

void main() {
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif

  float pulse = 0.55 + 0.45 * (0.5 + 0.5 * sin(uTime * 1.65 + aPhase)) * max(uPulse, 0.15);
  float flare = abs(aIndex - uFlareIndex) < 0.5 ? uFlare : 0.0;
  float age = max(uTime - aBorn, 0.0);
  float grow = aBorn < 0.02 ? 1.0 : min(1.0, 1.0 - exp(-age * 3.4));
  vAlpha = (0.22 * pulse + flare * 0.55 + aYou * 0.2) * grow;

  vec3 transformed = position * (1.0 + flare * 0.8 + aYou * 0.35) * grow;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`

export const haloFragment = `
varying vec3 vColor;
varying float vAlpha;

void main() {
  gl_FragColor = vec4(vColor, vAlpha);
}
`

export const beamVertex = `
attribute float aPhase;
attribute float aIndex;
attribute float aBorn;
uniform float uTime;
uniform float uPulse;
uniform float uFlareIndex;
uniform float uFlare;
varying vec3 vColor;
varying float vAlong;
varying float vGlow;

void main() {
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif

  vAlong = clamp(position.y / 0.09 + 0.5, 0.0, 1.0);
  float pulse = 0.7 + 0.3 * sin(uTime * 1.65 + aPhase) * uPulse;
  float flare = abs(aIndex - uFlareIndex) < 0.5 ? uFlare : 0.0;
  float age = max(uTime - aBorn, 0.0);
  float grow = aBorn < 0.02 ? 1.0 : min(1.0, 1.0 - exp(-age * 3.4));
  vGlow = pulse + flare;

  vec3 transformed = position;
  transformed.y *= (0.85 + 0.35 * flare) * grow;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`

export const beamFragment = `
varying vec3 vColor;
varying float vAlong;
varying float vGlow;

void main() {
  float fade = 1.0 - vAlong;
  float alpha = fade * fade * (0.28 + vGlow * 0.35);
  gl_FragColor = vec4(vColor, alpha);
}
`
