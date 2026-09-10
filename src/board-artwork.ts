import * as THREE from 'three'
import manifest from '../public/artwork/manifest.json'

export const ARTWORK_HOLES = manifest.holes.filter(h => h.artworkRadius < 1.5).map(h => ({
  x: h.x, z: h.z, throughHole: h.shape !== 'round' || h.artworkRadius > 0.6,
  shape: h.shape, padWidth: h.padWidth, padDepth: h.padDepth,
  // Filled circles in assembly artwork are symbols, not a drill table.
  radius: h.shape === 'oval' ? 0.28 : h.shape === 'square' || h.artworkRadius > 0.6 ? 0.38 : 0.17,
}))
export type BoardArtwork = Record<'frontSilk' | 'frontCopper' | 'backSilk' | 'backCopper', HTMLImageElement>
export async function loadBoardArtwork(): Promise<BoardArtwork> {
  const entries = await Promise.all([
    ['frontSilk', 'front-silk'], ['frontCopper', 'front-copper'], ['backSilk', 'back-silk'], ['backCopper', 'back-copper'],
  ].map(async ([key, name]) => {
    const image = new Image()
    image.src = `${import.meta.env.BASE_URL}artwork/${name}.svg`
    await image.decode()
    return [key, image]
  }))
  return Object.fromEntries(entries) as BoardArtwork
}
function mask(image: HTMLImageElement, color: string, mirrored: boolean, width: number, height: number) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  if (mirrored) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1) }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  ctx.setTransform(1,0,0,1,0,0)
  ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = color; ctx.fillRect(0,0,canvas.width,canvas.height)
  return canvas
}
export function boardLayerTextures(art: BoardArtwork, back = false) {
  // Reference back pages are shown as viewed from below. Shared front-world UVs therefore need one x mirror.
  const copper = back ? art.backCopper : art.frontCopper
  const silk = back ? art.backSilk : art.frontSilk
  const create = (mode: 'covered' | 'exposed' | 'relief' | 'surface') => {
    const canvas = document.createElement('canvas')
    const colorWidth = Math.round(manifest.boardMm[0] * 30), colorHeight = Math.round(manifest.boardMm[1] * 30)
    // Roughness G and metalness B share a half-resolution linear map, not two full RGBA maps.
    canvas.width = mode === 'surface' ? Math.round(colorWidth / 2) : mode === 'relief' ? 2300 : colorWidth
    canvas.height = mode === 'surface' ? Math.round(colorHeight / 2) : mode === 'relief' ? 1800 : colorHeight
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
    const palette = {
      covered: ['#123746', '#1b5363'], exposed: ['#20343c', '#d0a354'],
      relief: ['#707070', '#929292'], surface: ['#00b000', '#00a5ff'],
    }[mode]
    ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(mask(copper, palette[1], back, canvas.width, canvas.height), 0, 0)
    if (mode === 'covered' || mode === 'surface') {
      // Lighten changes G for ink without erasing the B copper mask beneath it.
      if (mode === 'surface') ctx.globalCompositeOperation = 'lighten'
      ctx.drawImage(mask(silk, mode === 'covered' ? '#e0e3d8' : '#00f000', back, canvas.width, canvas.height), 0, 0)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = mode === 'covered' || mode === 'exposed' ? THREE.SRGBColorSpace : THREE.NoColorSpace
    texture.anisotropy = 16
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    return texture
  }
  return { covered: create('covered'), exposed: create('exposed'), relief: create('relief'), surface: create('surface') }
}
