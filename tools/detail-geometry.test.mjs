// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as THREE from 'three'
const source = await readFile(new URL('../src/detail-geometry.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source.replace("from 'three'", 'from ' + JSON.stringify(import.meta.resolve('three'))), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { solderFilletGeometry, solderJointGeometry, padLandGeometry, radialLeadGeometry } = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
const hit = (geometry, point, direction) => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material)
  const found = new THREE.Raycaster(new THREE.Vector3(...point),new THREE.Vector3(...direction)).intersectObject(mesh)[0]
  material.dispose()
  return found
}
test('SMD solder surface wets the termination with a concave toe, not a rounded block',()=>{
  const geometry=solderFilletGeometry()
  const y=x=>hit(geometry,[x,2,0],[0,-1,0]).point.y
  assert.ok(y(-0.4)>y(0)&&y(0)>y(0.4))
  assert.ok(y(0)<(y(-0.4)+y(0.4))/2-0.035)
  geometry.computeBoundingBox()
  assert.equal(geometry.boundingBox.min.y,0)
  assert.ok(Math.abs(geometry.boundingBox.max.y-1)<1e-6)
  geometry.dispose()
})
test('through-hole meniscus retains an open lead bore and finite normals',()=>{
  const geometry=solderJointGeometry()
  assert.equal(hit(geometry,[0,2,0],[0,-1,0]),undefined)
  assert.ok(hit(geometry,[0.5,2,0],[0,-1,0]))
  assert.ok([...geometry.attributes.normal.array].every(Number.isFinite))
  geometry.dispose()
})
test('square and oblong lands keep a round bore while preserving their outer corners',()=>{
  for(const shape of ['square','oval']) {
    const geometry=padLandGeometry(shape,1.1,1.5,0.28)
    assert.equal(hit(geometry,[0,0,2],[0,0,-1]),undefined)
    assert.equal(hit(geometry,[0,0.25,2],[0,0,-1]),undefined)
    assert.ok(hit(geometry,[0,0.33,2],[0,0,-1]))
    assert.equal(Boolean(hit(geometry,[0.51,0.7,2],[0,0,-1])),shape==='square')
    geometry.dispose()
  }
})
test('radial lead end rings align with the board contact, not the opposite can end',()=>{
  const start=new THREE.Vector3(-0.42,1.12,-3.88),end=new THREE.Vector3(-0.5785,0.04,-5.1714)
  const geometry=radialLeadGeometry(start,end,0.1),positions=geometry.attributes.position
  const center=new THREE.Vector3()
  for(let i=positions.count-9;i<positions.count-1;i++)center.add(new THREE.Vector3().fromBufferAttribute(positions,i))
  center.multiplyScalar(1/8)
  assert.ok(center.distanceTo(end)<1e-6)
  assert.ok([...positions.array].every(Number.isFinite))
  geometry.dispose()
})
