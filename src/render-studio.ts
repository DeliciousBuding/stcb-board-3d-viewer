// SPDX-License-Identifier: Apache-2.0
/** Camera-independent studio lighting and a denoised linear-light contact-shadow pipeline. */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

type Camera = THREE.PerspectiveCamera | THREE.OrthographicCamera
export function createStudio(scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: Camera) {
  renderer.info.autoReset = false // Count the whole multipass frame, not only OutputPass.
  scene.background = new THREE.Color(0x14191f)
  const environment = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromScene(environment, 0.025)
  scene.environment = target.texture; scene.environmentIntensity = 0.72
  environment.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(material => material.dispose())
    }
  })
  pmrem.dispose()

  const ambient = new THREE.HemisphereLight(0xe8eef7, 0x292a31, 0.24)
  scene.add(ambient)
  const key = new THREE.DirectionalLight(0xfff2df, 3.05)
  key.position.set(-60, 100, 20)
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -75, right: 75, top: 65, bottom: -65, near: 1, far: 260 })
  key.shadow.radius = 2.2
  key.shadow.bias = -0.00002; key.shadow.normalBias = 0.018
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xcfe1ff, 0.58)
  fill.position.set(65, 48, 35); scene.add(fill)
  const rim = new THREE.DirectionalLight(0xffffff, 1.25)
  rim.position.set(10, 30, -85); scene.add(rim)
  const backLight = new THREE.DirectionalLight(0xe4eeff, 2.25)
  backLight.position.set(-45, -95, -60); backLight.visible = false; scene.add(backLight)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshStandardMaterial({ color: 0x20262d, roughness: 0.96 }))
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.74
  floor.receiveShadow = true; scene.add(floor)
  const grid = new THREE.GridHelper(190, 38, 0x68788a, 0x46515f)
  grid.position.y = -0.72; grid.material.transparent = true; grid.material.opacity = 0.12
  grid.visible = false; scene.add(grid)

  const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, renderTarget)
  const renderPass = new RenderPass(scene, camera)
  const ao = new GTAOPass(scene, camera, 1, 1)
  ao.updateGtaoMaterial({ radius: 0.34, distanceExponent: 1.15, thickness: 0.32, scale: 1.0, samples: 16, screenSpaceRadius: false })
  ao.updatePdMaterial({ radius: 7, rings: 2, samples: 16, lumaPhi: 10, depthPhi: 2, normalPhi: 3 })
  ao.output = GTAOPass.OUTPUT.Default
  ao.blendIntensity = 0.68
  composer.addPass(renderPass); composer.addPass(ao)
  composer.addPass(new OutputPass())
  let renderedFrames = 0
  let gridEnabled = false, backMode = false
  return {
    resize(width: number, height: number) { composer.setSize(width, height) },
    setCamera(next: Camera) {
      renderPass.camera = next; ao.camera = next
      const perspective = next instanceof THREE.PerspectiveCamera ? 1 : 0
      if (ao.gtaoMaterial.defines.PERSPECTIVE_CAMERA !== perspective) {
        ao.gtaoMaterial.defines.PERSPECTIVE_CAMERA = perspective; ao.gtaoMaterial.needsUpdate = true
      }
    },
    setBackView(back: boolean) { backMode = back; floor.visible = !back; backLight.visible = back; grid.visible = gridEnabled && !back },
    setAO(value: boolean) { ao.enabled = value },
    setGrid(value: boolean) { gridEnabled = value; grid.visible = value && !backMode },
    frameStats() { return { renderedFrames, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } },
    render() {
      renderer.info.reset()
      renderedFrames++
      composer.render()
    },
  }
}
