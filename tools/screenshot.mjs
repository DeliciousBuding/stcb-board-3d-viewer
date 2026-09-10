// SPDX-License-Identifier: Apache-2.0
// Headless browser regression and screenshot runner.
// Uses an installed Edge or Chrome channel through playwright-core, so no browser download is required.
// Usage: node tools/screenshot.mjs [--port 4173] [--view iso|top|bottom] [--labels on|off]
//        [--out PATH] [--wait 2500] [--width 1600] [--height 1000] [--url URL] [--channel msedge]
// A healthy preview server is reused; otherwise this tool starts and recycles vite preview.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}

const port = arg('port', '4173')
const url = arg('url', 'http://localhost:' + port + '/')
const view = arg('view', 'iso')
const labels = arg('labels', 'on')
const out = path.resolve(arg('out', 'artifacts/screenshots/' + view + '.png'))
const channel = arg('channel', 'msedge')
const embed = arg('embed', 'off') === 'on'
const pageUrl = new URL(url)
if (embed) pageUrl.searchParams.set('embed', '1')
const waitMs = Number(arg('wait', '2500'))
const width = Number(arg('width', '1600'))
const height = Number(arg('height', '1000'))

async function probe() {
  try {
    const r = await fetch(url)
    return r.ok
  } catch {
    return false
  }
}

let server = null
if (!(await probe())) {
  if (process.argv.includes('--url')) throw new Error('Requested preview URL is unavailable; --url never starts a replacement server: ' + url)
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', port, '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true,
  })
  server.on('error', error => console.error(error.message))
  for (let i = 0; i < 40 && !(await probe()); i++) await sleep(500)
  if (!(await probe())) {
    console.error('preview server did not start on ' + url)
    server.kill()
    throw new Error('Preview startup failed')
  }
}

let browser
try {
const launchOptions = { headless: true, args: ['--enable-unsafe-swiftshader'] }
if (channel !== 'chromium') launchOptions.channel = channel
browser = await chromium.launch(launchOptions)
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(pageUrl.toString(), { waitUntil: 'networkidle' })
  await page.waitForSelector('body[data-ready="true"]')
  await page.waitForSelector('canvas')
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Viewer must not overflow horizontally')
  if (process.argv.includes('--check')) {
    const api = await page.evaluate(() => {
      const viewer = window.stcbBoardViewer
      const before = viewer.getVisualState()
      viewer.setVisualState({ powered: true, display: '12345678', ledMask: 126, ledColor: 'blue' })
      let rejected = false
      try { viewer.setVisualState({ ledMask: 256 }) } catch { rejected = true }
      window.postMessage({ type: 'stcb-board:set-state', state: { display: '87654321' } }, '*')
      viewer.setVisualState(before)
      return { version: viewer.version, ready: viewer.ready, before, rejected }
    })
    assert.equal(api.version, '0.1.2')
    assert.equal(api.ready, true)
    assert.equal(api.rejected, true, 'Visual state must reject invalid masks')
    await page.waitForFunction(() => window.stcbBoardViewer.getVisualState().display === '87654321')
  }
  if (!process.argv.includes('--url')) {
    const html = await readFile(path.join(root, 'dist/index.html'), 'utf8')
    const expected = html.match(/src="([^"]+\.js)"/)?.[1]
    assert.ok(expected && await page.locator(`script[src="${expected}"]`).count(), 'Preview is not the current build')
  }
  await sleep(waitMs)
  const readDisplay = () => page.evaluate(() => {
    const face = window.__stcbDebug.model.parts.find(p => p.component.id === 'display-1').group.getObjectByName('display-face')
    const read = texture => {
      const canvas = texture.image, ctx = canvas.getContext('2d')
      const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let litPixels = 0
      for (let i = 0; i < data.length; i += 4) if (data[i] || data[i + 1] || data[i + 2]) litPixels++
      return { background: pixel(4, 4), decimal: pixel(269, 435), unlit: pixel(65, 150), lit: pixel(244, 167), litPixels }
    }
    return { color: read(face.material.map), emission: read(face.material.emissiveMap), separate: face.material.map !== face.material.emissiveMap, version: face.material.map.version }
  })
  if (process.argv.includes('--check')) {
    // Test the manufactured openings against triangles, not the presence of a black decal.
    for (const [partId, meshName, holes, solid] of [
      ['usb', 'usb-shell-roof', [[-1.8, 0], [-1.7, 2.58]], [0.5, 0]],
      ['button-1', 'switch-lid', [[0, 0], [2.32, 2.32]], [1.8, 1.8]],
      ['buzzer', 'buzzer-lid', [[0, 0]], [2, 0]],
    ]) {
      const data = await page.evaluate(([id, name]) => {
        const object = window.__stcbDebug.model.parts.find(p => p.component.id === id).group.getObjectByName(name)
        return { positions: [...object.geometry.attributes.position.array], indices: object.geometry.index ? [...object.geometry.index.array] : null, matrix: [...object.matrix.elements] }
      }, [partId, meshName])
      const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(data.positions, 3))
      if (data.indices) geometry.setIndex(data.indices)
      const mesh = new Mesh(geometry, new MeshBasicMaterial())
      mesh.matrix.fromArray(data.matrix); mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld(true)
      const hit = ([x, z]) => new Raycaster(new Vector3(x, 30, z), new Vector3(0, -1, 0)).intersectObject(mesh).length > 0
      for (const point of holes) assert.equal(hit(point), false, meshName + ' aperture must remain open')
      assert.equal(hit(solid), true, meshName + ' must retain solid material around its aperture')
      geometry.dispose(); mesh.material.dispose()
    }
    const radialContacts = await page.evaluate(() => {
      const { model } = window.__stcbDebug
      return ['vibration', 'crystal-2'].map(id => {
        const part = model.parts.find(p => p.component.id === id)
        const positions = part.component.contacts.map((pad, i) => {
          const lead = part.group.getObjectByName('radial-lead-' + i), buffer = lead.geometry.attributes.position
          const center = window.__stcbDebug.camera.position.clone().set(0, 0, 0)
          for (let j = buffer.count - 9; j < buffer.count - 1; j++) {
            const point = center.clone().fromBufferAttribute(buffer, j).applyMatrix4(lead.matrixWorld)
            center.add(point)
          }
          center.multiplyScalar(1 / 8)
          return { actual: center.toArray(), expected: [pad[0] - 46, 1.64, pad[1] - 36] }
        })
        return { id, positions, starts: part.group.userData.leadContacts.map(lead => lead.start[2]) }
      })
    })
    for (const part of radialContacts) {
      assert.equal(part.starts.length, 2)
      assert.equal(Math.sign(part.starts[0]), Math.sign(part.starts[1]), part.id + ' leads must share one end')
      for (const point of part.positions) assert.ok(Math.hypot(...point.actual.map((value,i)=>value-point.expected[i])) < 0.00001, part.id + ' lead tips must reach registered pads')
    }
    const idleFrame = await page.evaluate(() => window.__stcbDebug.frameStats.renderedFrames)
    await sleep(400)
    assert.equal(await page.evaluate(() => window.__stcbDebug.frameStats.renderedFrames), idleFrame, 'An idle viewer must stop rendering')
    const displayOff = await readDisplay()
    assert.equal(displayOff.separate, true, 'Diffuse and emitted light must have separate maps')
    assert.equal(displayOff.emission.litPixels, 0, 'An unpowered display must emit no light')
    const toggle = name => page.locator(`button[data-action="${name}"]`)
    const canvas = page.locator('canvas')
    await toggle('labels').click()
    await toggle('top').click()
    assert.equal(await page.getAttribute('body', 'data-view'), 'top')
    const off = await canvas.screenshot()
    await toggle('power').click()
    assert.equal(await toggle('power').getAttribute('aria-pressed'), 'true')
    await sleep(200)
    assert.ok(!off.equals(await canvas.screenshot()), 'Power must update rendered pixels')
    await page.locator('#display-value').fill('11111111')
    const litDisplay = await readDisplay()
    for (const region of ['background', 'decimal', 'unlit']) {
      assert.deepEqual(litDisplay.color[region], displayOff.color[region], 'Power must preserve unlit diffuser/background color')
      assert.deepEqual(litDisplay.emission[region], [0, 0, 0], region + ' must not emit light')
    }
    assert.ok(litDisplay.emission.lit[0] > 200 && litDisplay.emission.lit[1] < 40, 'Active segment emits red, not white')
    await page.locator('#display-value').fill('        ')
    assert.equal((await readDisplay()).emission.litPixels, 0, 'Powered blank digits must not emit a rectangular face glow')
    await page.locator('#display-value').fill('12345678')
    assert.equal(await page.evaluate(() => window.__stcbDebug.visualState.display), '12345678')
    await sleep(200)
    const digits = await canvas.screenshot()
    await page.locator('#display-value').fill('87654321')
    await sleep(200)
    assert.ok(!digits.equals(await canvas.screenshot()), 'Changing digits must redraw the lit display')
    await page.locator('#led-color').selectOption('red')
    await sleep(200)
    const red = await canvas.screenshot()
    await page.locator('#led-color').selectOption('blue')
    await sleep(200)
    assert.ok(!red.equals(await canvas.screenshot()), 'Blue and red LED must render differently')
    const displayVersion = (await readDisplay()).version
    await page.locator('[data-led="0"]').click()
    assert.equal(await page.evaluate(() => window.__stcbDebug.visualState.ledMask), 254)
    await page.locator('[data-led="7"]').click()
    assert.equal(await page.evaluate(() => window.__stcbDebug.visualState.ledMask), 126)
    assert.equal((await readDisplay()).version, displayVersion, 'LED-only changes must not re-upload the display texture')
    await toggle('power').click()
    assert.equal((await readDisplay()).emission.litPixels, 0, 'Power-off must clear the emission map')
    assert.equal(await page.evaluate(() => window.__stcbDebug.visualState.ledMask), 126, 'Power off must preserve the mask')
    await page.locator('[data-led="0"]').click(); await page.locator('[data-led="7"]').click()
    await page.locator('#display-value').fill('12345678')
    const shadowed = await canvas.screenshot()
    await toggle('ao').click(); await sleep(200)
    assert.ok(!shadowed.equals(await canvas.screenshot()), 'AO toggle must affect contact shading')
    await toggle('ao').click()
    await toggle('grid').click(); assert.equal(await toggle('grid').getAttribute('aria-pressed'), 'true')
    await toggle('grid').click()
    const covered = await canvas.screenshot()
    await toggle('copper').click(); await sleep(300)
    assert.ok(!covered.equals(await canvas.screenshot()), 'Copper artwork must replace covered surface')
    const surface = await page.evaluate(() => {
      const material = window.__stcbDebug.model.root.getObjectByName('pcb').material[0]
      const image = material.metalnessMap.image, data = image.getContext('2d').getImageData(0,0,image.width,image.height).data
      let dielectric = 0, copper = 0, roughInk = 0
      for(let i=0;i<data.length;i+=4){ if(data[i+2]===0)dielectric++; if(data[i+2]===255)copper++; if(data[i+1]>=235)roughInk++ }
      return { width:image.width,height:image.height,dielectric,copper,roughInk,linear:material.metalnessMap.colorSpace==='' }
    })
    assert.deepEqual([surface.width,surface.height],[1380,1080])
    assert.ok(surface.dielectric>10000&&surface.copper>10000&&surface.roughInk>100, 'Packed surface map must retain independent substrate, copper and rough silk')
    assert.equal(surface.linear,true,'Material masks are linear data, not sRGB color')
    await toggle('components').click(); await sleep(300)
    assert.equal(await toggle('components').getAttribute('aria-pressed'), 'false')
    const hiddenMcu = await page.evaluate(() => {
      const { model, camera } = window.__stcbDebug, point = camera.position.clone()
      model.parts.find(p => p.component.id === 'mcu').group.getWorldPosition(point)
      point.project(camera)
      const r = document.querySelector('canvas').getBoundingClientRect()
      return { x: r.left + (point.x + 1) * r.width / 2, y: r.top + (1 - point.y) * r.height / 2 }
    })
    await page.mouse.click(hiddenMcu.x, hiddenMcu.y)
    assert.equal(await toggle('components').getAttribute('aria-pressed'), 'false', 'Hidden meshes must not be picked through the bare PCB')
    const frontCopper = await canvas.screenshot()
    await toggle('bottom').click(); await sleep(300)
    assert.equal(await page.getAttribute('body','data-view'), 'bottom')
    assert.ok(!frontCopper.equals(await canvas.screenshot()), 'Back copper must be an independent layer')
    await toggle('copper').click(); await sleep(300)
    await toggle('top').click()
    await page.locator('[data-part-id="joystick"]').click()
    assert.equal(await toggle('components').getAttribute('aria-pressed'), 'true', 'Selecting a hidden part restores components')
    await toggle('top').click()
    const ids = await page.locator('[data-part-id]').evaluateAll(items => items.map(item => item.dataset.partId))
    assert.ok(ids.length > 25)
    assert.equal(new Set(ids).size, ids.length, 'Component IDs must be unique')
    for (const id of ids) {
      const item = page.locator(`[data-part-id="${id}"]`)
      await item.click()
      assert.equal(await item.getAttribute('aria-current'), 'true')
      assert.ok((await page.locator('#selection-name').innerText()).length > 0)
    }
    assert.equal(await page.getAttribute('body', 'data-view'), 'iso', 'Focus exits orthographic mode')
    await toggle('reset').click()
    await sleep(1200)
    const assembled = await canvas.screenshot()
    await toggle('explode').click()
    await sleep(1300)
    assert.ok(!assembled.equals(await canvas.screenshot()), 'Explode must move the model')
    await toggle('top').click()
    await toggle('rotate').click()
    assert.equal(await page.getAttribute('body', 'data-view'), 'iso')
    assert.equal(await toggle('rotate').getAttribute('aria-pressed'), 'true')
    const rotatingFrame = await page.evaluate(() => window.__stcbDebug.frameStats.renderedFrames)
    await sleep(250)
    assert.ok(await page.evaluate(() => window.__stcbDebug.frameStats.renderedFrames) > rotatingFrame, 'Auto-rotate must wake and keep rendering')
    await toggle('reset').click()
    assert.equal(await toggle('explode').getAttribute('aria-pressed'), 'false')
    assert.equal(await toggle('rotate').getAttribute('aria-pressed'), 'false')
    await toggle('labels').click()
    console.log(`PASS: radial contacts, packed surface channels, idle sleep/auto-rotate wake, true USB/switch/buzzer apertures, isolated red segment emission, ${ids.length} selections, digits, red/blue LEDs, mask/power retention, AO/grid, front/back copper, hidden-part hit testing, hide/restore parts, explode, ortho/focus/rotate/reset`)
  }
  if (embed) {
    const chrome = await page.evaluate(() => ({
      header: getComputedStyle(document.querySelector('.app-header')).display,
      inspector: getComputedStyle(document.querySelector('.inspector')).display,
      status: getComputedStyle(document.querySelector('.statusbar')).display,
    }))
    assert.deepEqual(chrome, { header: 'none', inspector: 'none', status: 'none' })
    await page.waitForFunction(() => !window.__stcbDebug.renderPending, null, { timeout: 10000 })
  } else {
    const pressed = await page.getAttribute('button[data-action="labels"]', 'aria-pressed')
    if (labels === 'off' && pressed === 'true') await page.click('button[data-action="labels"]')
    if (labels === 'on' && pressed === 'false') await page.click('button[data-action="labels"]')
    if (view === 'bottom') {
      await page.click('button[data-action="bottom"]')
    } else if (view === 'top') {
      await page.click('button[data-action="top"]')
    } else {
      await page.click('button[data-action="reset"]')
    }
    if (arg('copper', 'off') === 'on') await page.click('button[data-action="copper"]')
    if (arg('components', 'on') === 'off') await page.click('button[data-action="components"]')
    if (arg('power', 'off') === 'on') await page.click('button[data-action="power"]')
    if (arg('digits', '')) await page.locator('#display-value').fill(arg('digits', ''))
    if (arg('focus', '')) await page.locator(`[data-part-id="${arg('focus', '')}"]`).click()
    await page.waitForFunction(() => !window.__stcbDebug.renderPending, null, { timeout: 10000 })
    if (arg('azimuth', '') !== '' || arg('elevation', '') !== '') {
      assert.equal(view, 'iso', 'Inspection angles require --view iso')
      const angles = { azimuth: Number(arg('azimuth', '40')), elevation: Number(arg('elevation', '40')) }
      assert.ok(Number.isFinite(angles.azimuth) && angles.elevation > 0 && angles.elevation < 90, 'Use a finite azimuth and elevation between 0 and 90')
      await page.evaluate(({ azimuth, elevation }) => {
        const { camera, controls } = window.__stcbDebug
        const radius = camera.position.distanceTo(controls.target), a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180
        camera.position.set(radius * Math.sin(a) * Math.cos(e), radius * Math.sin(e), radius * Math.cos(a) * Math.cos(e)).add(controls.target)
        controls.update()
      }, angles)
      await page.waitForFunction(() => !window.__stcbDebug.renderPending, null, { timeout: 10000 })
    }
    if (!arg('focus', '')) {
      const corners = await page.evaluate(() => {
        const { model, camera } = window.__stcbDebug, pcb = model.root.getObjectByName('pcb')
        const { min, max } = pcb.geometry.boundingBox, points = []
        for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
          const point = min.clone().set(x, y, z).applyMatrix4(pcb.matrixWorld).project(camera)
          points.push([point.x, point.y])
        }
        return points
      })
      assert.ok(corners.every(([x, y]) => Math.abs(x) < 0.99 && Math.abs(y) < 0.99), 'Default views must frame the whole PCB, including narrow phones')
    }
  }
  // Button clicks can horizontally scroll the mobile toolbar; return evidence to its start.
  await page.locator('.view-toolbar').evaluate(element => { element.scrollLeft = 0 })
  if (errors.length) throw new Error(errors.join('\n'))
  await mkdir(path.dirname(out), { recursive: true })
  if (arg('frame', 'canvas') === 'full') await page.screenshot({ path: out })
  else await page.locator('canvas').screenshot({ path: out })
  const report = { checked: process.argv.includes('--check'), browser: await browser.version(), view, focus: arg('focus', null), azimuth: arg('azimuth', null), elevation: arg('elevation', null), viewport: { width, height, deviceScaleFactor: 2 }, screenshot: path.basename(out), buildScript: await page.locator('script[type="module"]').evaluateAll(scripts => scripts.map(script => script.getAttribute('src')).find(src => src && !src.includes('/@vite/'))), ...(await page.evaluate(() => ({ visualState: window.__stcbDebug.visualState, frameStats: window.__stcbDebug.frameStats }))), errors }
  if (arg('report', '')) {
    const reportPath = path.resolve(arg('report', ''))
    await mkdir(path.dirname(reportPath), { recursive: true })
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  }
  console.log(JSON.stringify(report))
  console.log('saved ' + out)
} finally {
  await browser?.close()
  if (server) server.kill()
}
