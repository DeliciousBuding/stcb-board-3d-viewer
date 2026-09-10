/** Deterministic, multi-scale manufacturing detail, not photographic evidence. */
import * as THREE from 'three'

const cache = new Map<string, THREE.DataTexture>()

function hash(x: number, y: number, seed: number) {
  let value = Math.imul(x + seed * 374761393, 668265263) ^ Math.imul(y + seed * 1442695041, 2246822519)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295
}

function smoothNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const tx = x - xi, ty = y - yi
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed)
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed)
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, sx), THREE.MathUtils.lerp(c, d, sx), sy)
}

export function surfaceMap(kind: 'grain' | 'brushed' | 'mask') {
  if (cache.has(kind)) return cache.get(kind)!
  const size = 512, pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fine = smoothNoise(x / 13, y / 13, 3)
      const broad = smoothNoise(x / 61, y / 61, 11)
      const value = kind === 'brushed'
        // Brushed metal reads as shallow directional streaks, not white-pixel noise.
        ? 214 + (smoothNoise(0.7, y / 6, 23) - 0.5) * 28 + (smoothNoise(x / 34, y / 8, 29) - 0.5) * 14
        : kind === 'mask'
          ? 174 + (fine - 0.5) * 18 + 5 * Math.sin(x / 23) * Math.cos(y / 27)
          : 183 + (fine - 0.5) * 25 + (broad - 0.5) * 17
      const i = (y * size + x) * 4
      const clamped = Math.max(0, Math.min(255, value))
      pixels[i] = pixels[i + 1] = pixels[i + 2] = clamped; pixels[i + 3] = 255
    }
  }
  const map = new THREE.DataTexture(pixels, size, size)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter
  map.generateMipmaps = true; map.repeat.set(kind === 'mask' ? 10 : 2, kind === 'mask' ? 8 : 2)
  map.anisotropy = 16
  map.needsUpdate = true; cache.set(kind, map)
  return map
}
