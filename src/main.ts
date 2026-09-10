import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createStudio } from './render-studio'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { BoardVisualPatch, LedColor } from './visual-state'
import { loadBoardArtwork } from './board-artwork'
import { BOARD } from './board-layout'
import { createBoardModel, type BoardPart } from './board-model'

const VIEWER_VERSION = '0.1.1'

document.title = 'STC-B Digital Twin'

const embedMode = new URLSearchParams(window.location.search).get('embed') === '1'
document.body.dataset.embed = String(embedMode)

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <main class="app-shell">
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark">STC-B</span>
        <span class="brand-separator">/</span>
        <h1>Digital Twin</h1>
      </div>

      <div class="specs" aria-label="板卡参数">
        <span><b>尺寸</b>92 × 72 mm</span>
        <span><b>MCU</b>IAP15F2K61S2</span>
        <span><b>显示</b>8 位数码管</span>
      </div>

      <div class="view-toolbar" role="toolbar" aria-label="视图控制">
        <button type="button" data-action="power" aria-pressed="false">通电演示</button>
        <button type="button" data-action="rotate" aria-pressed="false">自动旋转</button>
        <button type="button" data-action="labels" aria-pressed="true">关键标注</button>
        <button type="button" data-action="explode" aria-pressed="false">拆解</button>
        <button type="button" data-action="top">俯视</button>
        <button type="button" data-action="reset">重置视角</button>
      </div>
    </header>

    <aside class="inspector" aria-label="板载组件">
      <div class="inspector-head">
        <span>板载组件</span>
        <span id="part-count" class="panel-count"></span>
      </div>
      <div id="part-list" class="part-list"></div>
      <section class="light-settings" aria-label="灯光演示">
        <div class="selection-label">数码管 / LED · 本地预览</div>
        <label for="display-value">红色数码管 · 最多 8 位</label>
        <input id="display-value" value="12345678" maxlength="8" pattern="[0-9 -]{0,8}" inputmode="numeric" aria-describedby="display-hint" />
        <small id="display-hint">支持数字、空格、-；点「通电演示」发光</small>
        <label for="led-color">LED 预览配色</label>
        <select id="led-color"><option value="blue">蓝色</option><option value="red">红色</option><option value="green">绿色</option></select>
        <div class="led-switches" aria-label="独立 LED 控制">${Array.from({ length: 8 }, (_, i) => `<button type="button" data-led="${7 - i}" aria-pressed="true">L${7 - i}</button>`).join('')}</div>
        <small>配色为渲染效果，不代表实板支持 RGB</small>
      </section>
      <section class="render-settings" aria-label="渲染设置">
        <div class="selection-label">表面与光照 · 本地视觉模型</div>
        <div class="render-options">
          <button type="button" data-action="ao" aria-pressed="true">接触阴影</button>
          <button type="button" data-action="grid" aria-pressed="false">尺寸网格</button>
          <button type="button" data-action="copper" aria-pressed="false">铜箔层</button>
          <button type="button" data-action="components" aria-pressed="true">元件</button>
          <button type="button" data-action="bottom">背面</button>
        </div>
        <p>参考矢量层 · 正反面走线<br>铜箔模式移除阻焊与丝印；孔径为近似</p>
      </section>
      <section class="selection-panel" aria-live="polite">
        <div class="selection-label">当前选中</div>
        <h2 id="selection-name">点击一个元件</h2>
        <p id="selection-desc">拖动旋转，滚轮缩放；点击模型或左侧列表查看说明。</p>
      </section>
    </aside>

    <section class="workspace">
      <div id="viewport" class="viewport" aria-label="STC-B 学习板三维模型"></div>
      <footer class="statusbar">
        <span>拖动旋转 · 滚轮缩放 · 点击元件聚焦</span>
        <span id="status-state" class="status-state">AUTO OFF · LABELS ON · EXPLODE OFF</span>
      </footer>
    </section>
  </main>
`

const viewport = document.querySelector<HTMLDivElement>('#viewport')!
const partList = document.querySelector<HTMLDivElement>('#part-list')!
const partCount = document.querySelector<HTMLSpanElement>('#part-count')!
const selectionName = document.querySelector<HTMLHeadingElement>('#selection-name')!
const selectionDesc = document.querySelector<HTMLParagraphElement>('#selection-desc')!
const statusState = document.querySelector<HTMLSpanElement>('#status-state')!

const scene = new THREE.Scene()


const perspectiveCamera = new THREE.PerspectiveCamera(34, 1, 1, 1000)
const topCamera = new THREE.OrthographicCamera(-60, 60, 45, -45, 0.1, 1000)
let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspectiveCamera
camera.position.set(90, 98, 108)

function renderPixelRatio() {
  const native = window.devicePixelRatio || 1
  const area = viewport.clientWidth * viewport.clientHeight
  const supersample = area > 0 && area < 2_200_000 ? 1.25 : 1
  return Math.min(2, Math.max(native, supersample))
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(renderPixelRatio())
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.04
renderer.outputColorSpace = THREE.SRGBColorSpace
viewport.appendChild(renderer.domElement)

const labelRenderer = new CSS2DRenderer()
labelRenderer.domElement.className = 'label-layer'
labelRenderer.domElement.style.position = 'absolute'
labelRenderer.domElement.style.inset = '0'
labelRenderer.domElement.style.pointerEvents = 'none'
viewport.appendChild(labelRenderer.domElement)

const studio = createStudio(scene, renderer, camera)

const boardModel = createBoardModel(await loadBoardArtwork())
scene.add(boardModel.root)
const homeBounds = new THREE.Box3().setFromObject(boardModel.root)

let controls: OrbitControls<THREE.PerspectiveCamera | THREE.OrthographicCamera> = new OrbitControls(camera, renderer.domElement)
// Browser diagnostics only, not a device/control API.
Object.assign(window, { __stcbDebug: {
  get camera() { return camera },
  get controls() { return controls },
  get visualState() { return boardModel.getVisualState() },
  get model() { return boardModel },
  get frameStats() { return studio.frameStats() },
  get renderPending() { return frameRequested },
} })

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readVisualPatch(value: unknown): BoardVisualPatch {
  if (!isRecord(value)) throw new TypeError('state must be an object')
  const patch: BoardVisualPatch = {}
  if ('powered' in value) {
    if (typeof value.powered !== 'boolean') throw new TypeError('powered must be boolean')
    patch.powered = value.powered
  }
  if ('display' in value) {
    if (typeof value.display !== 'string') throw new TypeError('display must be a string')
    patch.display = value.display
  }
  if ('ledMask' in value) {
    if (!Number.isInteger(value.ledMask)) throw new TypeError('ledMask must be an integer')
    patch.ledMask = value.ledMask as number
  }
  if ('ledColor' in value) {
    if (value.ledColor !== 'blue' && value.ledColor !== 'red' && value.ledColor !== 'green') {
      throw new TypeError('ledColor must be blue, red or green')
    }
    patch.ledColor = value.ledColor
  }
  if (Object.keys(patch).length === 0) throw new TypeError('state patch is empty')
  return patch
}

function setExternalVisualState(patch: unknown) {
  boardModel.setVisualState(readVisualPatch(patch))
  invalidate()
  return boardModel.getVisualState()
}

const viewerApi = Object.freeze({
  version: VIEWER_VERSION,
  get ready() { return document.body.dataset.ready === 'true' },
  setVisualState: setExternalVisualState,
  getVisualState: () => boardModel.getVisualState(),
})
Object.assign(window, { stcbBoardViewer: viewerApi })

window.addEventListener('message', (event) => {
  if (!isRecord(event.data) || event.data.type !== 'stcb-board:set-state') return
  const source = event.source as WindowProxy | null
  if (!source) return
  try {
    const state = setExternalVisualState(event.data.state)
    source.postMessage({ type: 'stcb-board:state', state }, event.origin || '*')
  } catch (error) {
    source.postMessage({
      type: 'stcb-board:error',
      code: 'invalid_state',
      message: error instanceof Error ? error.message : 'invalid state',
    }, event.origin || '*')
  }
})
controls.enableDamping = true
controls.dampingFactor = 0.075
controls.target.set(0, 1, 0)
controls.minDistance = 42
controls.maxDistance = 320
controls.maxPolarAngle = Math.PI * 0.52
controls.autoRotateSpeed = 0.75
controls.update()

const defaultPosition = new THREE.Vector3(90, 98, 108)
const defaultTarget = new THREE.Vector3(0, 1, 0)
const homeDirection = defaultPosition.clone().sub(defaultTarget).normalize()
const homeRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), homeDirection).normalize()
const homeUp = new THREE.Vector3().crossVectors(homeDirection, homeRight)
let cameraGoal: { position: THREE.Vector3; target: THREE.Vector3 } | null = null
let frameRequested = false
controls.addEventListener('start', () => { cameraGoal = null; homeView = false })
controls.addEventListener('change', invalidate)
let selectedPart: BoardPart | null = null
let explodeTarget = 0
let explodeAmount = 0
let showLabels = true
let detailShadows = true
let showGrid = false
let showCopper = false
let showComponents = true
let backView = false
let homeView = true
const buttonsByPart = new Map<string, HTMLButtonElement>()

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const outline = new THREE.BoxHelper(new THREE.Object3D(), 0xffffff)
outline.visible = false
scene.add(outline)

partCount.textContent = String(boardModel.parts.length)

boardModel.parts.forEach((part, index) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'part-item'
  button.dataset.partId = part.component.id
  button.innerHTML = `<span class="part-index">${String(index + 1).padStart(2, '0')}</span><span class="part-name">${part.component.name}</span>`
  button.addEventListener('click', () => selectPart(part, true))
  button.addEventListener('pointerenter', () => button.classList.add('is-hovered'))
  button.addEventListener('pointerleave', () => button.classList.remove('is-hovered'))
  buttonsByPart.set(part.component.id, button)
  partList.appendChild(button)
})

function findPart(object: THREE.Object3D | null): BoardPart | null {
  let current = object
  while (current) {
    const id = current.userData.partId as string | undefined
    if (id) return boardModel.parts.find((part) => part.component.id === id) ?? null
    current = current.parent
  }
  return null
}

function setCameraGoal(position: THREE.Vector3, target: THREE.Vector3) {
  cameraGoal = { position, target }
  invalidate()
}

function focusPart(part: BoardPart) {
  if (camera === topCamera) switchCamera(false)
  homeView = false
  const target = new THREE.Vector3()
  part.group.getWorldPosition(target)
  const direction = camera.position.clone().sub(controls.target).normalize()
  const distance = Math.max(Math.max(part.component.w, part.component.d) * 2.8, 42)
  const position = target.clone().add(direction.multiplyScalar(distance)).add(new THREE.Vector3(0, 8, 0))
  setCameraGoal(position, target.clone().add(new THREE.Vector3(0, 2, 0)))
}

function selectPart(part: BoardPart | null, focus = false) {
  selectedPart = part
  invalidate()
  for (const button of buttonsByPart.values()) {
    button.classList.remove('is-selected')
    button.removeAttribute('aria-current')
  }
  if (part && !showComponents) {
    showComponents = true; boardModel.setComponentsVisible(true)
    updateToggle(document.querySelector<HTMLButtonElement>('[data-action="components"]')!, true)
  }
  if (!part) {
    selectionName.textContent = '点击一个元件'
    selectionDesc.textContent = '拖动旋转，滚轮缩放；点击模型或左侧列表查看说明。'
    outline.visible = false
    return
  }
  const button = buttonsByPart.get(part.component.id)
  button?.classList.add('is-selected')
  button?.setAttribute('aria-current', 'true')
  button?.scrollIntoView({ block: 'nearest' })
  selectionName.textContent = part.component.name
  selectionDesc.textContent = part.component.description
  outline.setFromObject(part.group)
  outline.visible = true
  if (focus) focusPart(part)
}

function updateToggle(button: HTMLButtonElement, enabled: boolean) {
  button.setAttribute('aria-pressed', String(enabled))
}

function updateStatus() {
  statusState.textContent = `${backView ? 'BACK' : camera === topCamera ? 'ORTHO' : 'PERSPECTIVE'} · POWER ${boardModel.getVisualState().powered ? 'ON' : 'OFF'} · AUTO ${controls.autoRotate ? 'ON' : 'OFF'} · LABELS ${showLabels ? 'ON' : 'OFF'} · EXPLODE ${explodeTarget > 0.5 ? 'ON' : 'OFF'}`
}

function updatePointer(event: PointerEvent) {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
}

renderer.domElement.addEventListener('pointermove', (event) => {
  updatePointer(event)
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(boardModel.root.children.filter(object => object.visible), true)[0]
  const part = findPart(hit?.object ?? null)
  renderer.domElement.style.cursor = part ? 'pointer' : 'grab'
})

let pointerStart: { x: number; y: number } | null = null

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY }
})

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerStart) return
  const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
  pointerStart = null
  if (distance > 4) return
  updatePointer(event)
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(boardModel.root.children.filter(object => object.visible), true)[0]
  const part = findPart(hit?.object ?? null)
  selectPart(part, Boolean(part))
})

renderer.domElement.addEventListener('pointerleave', () => {
  renderer.domElement.style.cursor = 'grab'
})

function resize() {
  const width = Math.max(1, viewport.clientWidth)
  const height = Math.max(1, viewport.clientHeight)
  const aspect = width / Math.max(1, height)
  perspectiveCamera.aspect = aspect
  perspectiveCamera.updateProjectionMatrix()
  // Fit the assembled board in BOTH frustum dimensions; fixed distance clipped phone views.
  const tan = Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2))
  let distance = 171
  for (const x of [homeBounds.min.x, homeBounds.max.x]) for (const y of [homeBounds.min.y, homeBounds.max.y]) for (const z of [homeBounds.min.z, homeBounds.max.z]) {
    const point = new THREE.Vector3(x, y, z).sub(defaultTarget)
    distance = Math.max(distance, point.dot(homeDirection) + Math.max(Math.abs(point.dot(homeRight)) / (tan * aspect), Math.abs(point.dot(homeUp)) / tan) / 0.92)
  }
  defaultPosition.copy(defaultTarget).addScaledVector(homeDirection, distance)
  controls.maxDistance = Math.max(320, distance * 1.8)
  if (homeView && camera === perspectiveCamera) {
    perspectiveCamera.position.copy(defaultPosition); controls.target.copy(defaultTarget); controls.update()
  }
  const halfHeight = Math.max(BOARD.depth / 2 + 8, (BOARD.width / 2 + 8) / aspect)
  topCamera.left = -halfHeight * aspect; topCamera.right = halfHeight * aspect
  topCamera.top = halfHeight; topCamera.bottom = -halfHeight
  topCamera.updateProjectionMatrix()
  renderer.setPixelRatio(renderPixelRatio())
  renderer.setSize(width, height, false)
  labelRenderer.setSize(width, height)
  studio.resize(width, height)
  invalidate()
}

const resizeObserver = new ResizeObserver(resize)
resizeObserver.observe(viewport)
resize()

const timer = new THREE.Timer()
function switchCamera(top: boolean, back = false) {
  backView = back
  homeView = !top
  studio.setBackView(back)
  controls.dispose()
  camera = top ? topCamera : perspectiveCamera
  studio.setCamera(camera)
  cameraGoal = null
  camera.up.set(0, top ? 0 : 1, top ? -1 : 0)
  camera.position.copy(top ? new THREE.Vector3(0, back ? -180 : 180, 0) : defaultPosition)
  camera.zoom = 1; camera.updateProjectionMatrix()
  controls = new OrbitControls(camera, renderer.domElement)
  controls.addEventListener('start', () => { cameraGoal = null; homeView = false })
  controls.addEventListener('change', invalidate)
  controls.enableDamping = true; controls.dampingFactor = 0.075
  controls.minDistance = 42; controls.maxDistance = 320
  controls.minZoom = 0.5; controls.maxZoom = 8
  controls.maxPolarAngle = back ? Math.PI : Math.PI * 0.52
  controls.enableRotate = !top; controls.autoRotateSpeed = 0.75
  controls.target.copy(top ? new THREE.Vector3() : defaultTarget)
  controls.update()
  document.body.dataset.view = back ? 'bottom' : top ? 'top' : 'iso'
  updateToggle(document.querySelector<HTMLButtonElement>('button[data-action="rotate"]')!, false)
  resize()
}

/** Sleep once damping/assembly settle; UI changes and OrbitControls wake the renderer. */
function invalidate() {
  if (!frameRequested) { frameRequested = true; requestAnimationFrame(animate) }
}
function animate() {
  frameRequested = false
  timer.update()
  const delta = Math.min(timer.getDelta(), 0.05)
  if (cameraGoal) {
    const blend = 1 - Math.exp(-5.4 * delta)
    camera.position.lerp(cameraGoal.position, blend)
    controls.target.lerp(cameraGoal.target, blend)
    if (camera.position.distanceTo(cameraGoal.position) < 0.02 && controls.target.distanceTo(cameraGoal.target) < 0.02) {
      camera.position.copy(cameraGoal.position); controls.target.copy(cameraGoal.target)
      cameraGoal = null
    }
  }
  if (explodeAmount !== explodeTarget) {
    explodeAmount += (explodeTarget - explodeAmount) * (1 - Math.exp(-6.5 * delta))
    if (Math.abs(explodeTarget - explodeAmount) < 0.0001) explodeAmount = explodeTarget
    boardModel.setExplode(explodeAmount)
  }
  if (selectedPart) {
    outline.setFromObject(selectedPart.group)
    outline.update()
  }
  const moving = controls.update(delta)
  studio.render()
  labelRenderer.render(scene, camera)
  if (cameraGoal || explodeAmount !== explodeTarget || controls.autoRotate || moving) invalidate()
}

for (const part of boardModel.parts) part.label.visible = Boolean(part.component.label)
boardModel.setDisplayText('12345678')
boardModel.setPower(false)
document.body.dataset.view = 'iso'
invalidate()
document.body.dataset.ready = 'true'
updateStatus()
if (window.parent !== window) {
  window.parent.postMessage({ type: 'stcb-board:ready', version: VIEWER_VERSION }, '*')
}

document.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    invalidate()
    const action = button.dataset.action
    if (action === 'copper') {
      showCopper = !showCopper; boardModel.setCopperVisible(showCopper); updateToggle(button, showCopper)
    }
    if (action === 'components') {
      showComponents = !showComponents; boardModel.setComponentsVisible(showComponents); updateToggle(button, showComponents); selectPart(null)
    }
    if (action === 'bottom') { switchCamera(true, true); selectPart(null); updateStatus() }
    if (action === 'ao') {
      detailShadows = !detailShadows; studio.setAO(detailShadows); updateToggle(button, detailShadows)
    }
    if (action === 'grid') {
      showGrid = !showGrid; studio.setGrid(showGrid); updateToggle(button, showGrid)
    }
    if (action === 'power') {
      boardModel.setPower(!boardModel.getVisualState().powered)
      updateToggle(button, boardModel.getVisualState().powered); updateStatus()
    }
    if (action === 'rotate') {
      if (camera === topCamera) switchCamera(false)
      homeView = false
      camera.up.set(0, 1, 0)
      controls.autoRotate = !controls.autoRotate
      updateToggle(button, controls.autoRotate)
      updateStatus()
    }
    if (action === 'labels') {
      showLabels = !showLabels
      labelRenderer.domElement.style.display = showLabels ? '' : 'none'
      updateToggle(button, showLabels)
      updateStatus()
    }
    if (action === 'explode') {
      explodeTarget = explodeTarget > 0.5 ? 0 : 1
      updateToggle(button, explodeTarget > 0.5)
      updateStatus()
    }
    if (action === 'top') {
      switchCamera(true); updateStatus()
    }
    if (action === 'reset') {
      switchCamera(false)
      controls.autoRotate = false
      explodeTarget = 0
      updateToggle(document.querySelector<HTMLButtonElement>('button[data-action="rotate"]')!, false)
      updateToggle(document.querySelector<HTMLButtonElement>('button[data-action="explode"]')!, false)
      setCameraGoal(defaultPosition.clone(), defaultTarget.clone())
      selectPart(null)
      updateStatus()
    }
  })
})

const displayInput = document.querySelector<HTMLInputElement>('#display-value')!
displayInput.addEventListener('input', () => {
  const valid = /^[0-9 -]{0,8}$/.test(displayInput.value)
  displayInput.setCustomValidity(valid ? '' : '请输入最多8位数字、空格或横线')
  displayInput.setAttribute('aria-invalid', String(!valid))
  if (valid) { boardModel.setDisplayText(displayInput.value); invalidate() }
})
document.querySelector<HTMLSelectElement>('#led-color')!.addEventListener('change', event => {
  boardModel.setVisualState({ ledColor: (event.target as HTMLSelectElement).value as LedColor }); invalidate()
})
document.querySelectorAll<HTMLButtonElement>('[data-led]').forEach(button => {
  button.addEventListener('click', () => {
    const bit = 1 << Number(button.dataset.led)
    const ledMask = boardModel.getVisualState().ledMask ^ bit
    boardModel.setVisualState({ ledMask }); invalidate(); updateToggle(button, Boolean(ledMask & bit))
  })
})
