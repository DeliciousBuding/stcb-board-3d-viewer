// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const root = new URL('../public/artwork/',import.meta.url)
const manifest = JSON.parse(await readFile(new URL('manifest.json',root),'utf8'))
test('four independent reference layers retain extraction hashes and do not contain external resources',async()=>{
  assert.deepEqual(manifest.layers.map(l=>l.page),[1,2,3,4])
  assert.equal(new Set(manifest.layers.map(l=>l.sha256)).size,4)
  for(const layer of manifest.layers){
    const svg=await readFile(new URL(`${layer.name}.svg`,root),'utf8')
    assert.equal(createHash('sha256').update(svg).digest('hex'),layer.sha256)
    assert.match(svg,/viewBox="0 0 260.88 201.6"/)
    assert.ok(!/<(?:script|image|foreignObject)\b|(?:href|onload)=/i.test(svg))
  }
})
test('hole centers are inside the board and back registration is independently checked',()=>{
  assert.equal(manifest.holes.length,223)
  for(const h of manifest.holes){assert.ok(h.x>0&&h.x<92&&h.z>0&&h.z<72);assert.ok(h.artworkRadius>0)}
  assert.equal(manifest.registration.backMirrorX,true)
  assert.equal(manifest.registration.matchedCenters,219)
  assert.ok(manifest.registration.maxErrorMm<0.06)
})

test('all oblong and square assembly pad symbols survive extraction without inventing slot drills',()=>{
  const counts = manifest.holes.reduce((all,pad)=>(all[pad.shape]=(all[pad.shape]??0)+1,all),{})
  assert.deepEqual(counts,{round:212,oval:5,square:6})
  for(const [x,z] of [[39.8215,60.4286],[41.345,60.4286],[7.2153,3.8679],[90.0957,27.675]]) {
    assert.ok(manifest.holes.some(pad=>Math.hypot(pad.x-x,pad.z-z)<0.002))
  }
  assert.ok(manifest.holes.every(pad=>pad.padWidth>0&&pad.padDepth>0&&!('drillShape' in pad)))
})
