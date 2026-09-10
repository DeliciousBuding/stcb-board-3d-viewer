// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/board-layout.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { COMPONENTS, PASSIVES, PASSIVE_ENVELOPES } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
function corners(p) {
  const a = (p.rotation ?? 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  if (p.id && ['battery','buzzer','capacitor','ldr'].includes(p.kind)) return Array.from({length:32},(_,i)=>{const t=i*Math.PI/16;return [p.x+Math.cos(t)*p.w/2,p.z+Math.sin(t)*p.d/2]})
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z]) => [p.x + c*x*p.w/2 - s*z*p.d/2, p.z + s*x*p.w/2 + c*z*p.d/2])
}
function intersects(a, b) {
  const pa = corners(a), pb = corners(b)
  for (const poly of [pa, pb]) for (let i=0; i<poly.length; i++) {
    const x = poly[(i+1)%poly.length][0]-poly[i][0], z = poly[(i+1)%poly.length][1]-poly[i][1]
    const length = Math.hypot(x,z), axis = [-z/length,x/length]
    const projected = pts => pts.map(p => p[0]*axis[0]+p[1]*axis[1])
    const aa=projected(pa), bb=projected(pb)
    if (Math.min(Math.max(...aa),Math.max(...bb)) - Math.max(Math.min(...aa),Math.min(...bb)) < 0.04) return false
  }
  return true
}
const bodies = COMPONENTS.map(c => ({...c, ref:c.id,
  // Conservative contact envelope includes the gull-wing feet, not just the black body.
  w:c.w + (c.kind==='qfp'?2.9:c.kind==='navigation'?1.6:0), d:c.d + (['qfp','soic'].includes(c.kind)?2.9:0),
})).concat(PASSIVES.map(p => ({...p, ...PASSIVE_ENVELOPES[p.kind], rotation:p.vertical?90:0})))
test('unique physical references: a bank must not silently reuse R43/R44/R45',()=>{
  const refs = PASSIVES.map(p=>p.ref)
  assert.equal(new Set(refs).size,refs.length)
})
test('registered body/contact envelopes do not intersect across different parts',()=>{
  const collisions=[]
  for(let i=0;i<bodies.length;i++) for(let j=i+1;j<bodies.length;j++) {
    if(intersects(bodies[i],bodies[j])) collisions.push(`${bodies[i].ref} / ${bodies[j].ref}`)
  }
  assert.deepEqual(collisions,[])
})

test('joystick regression: rotation-aware envelopes, not unrotated width/depth checks',()=>{
  const knob = bodies.find(p=>p.ref==='joystick')
  assert.equal(knob.rotation,45)
  assert.ok(intersects(knob,{x:knob.x+3.8,z:knob.z,w:0.8,d:0.8}))
  assert.ok(!intersects(knob,{x:knob.x+3.8,z:knob.z+3.8,w:0.4,d:0.4}))
})

test('the previously misplaced R12 fails the same joystick clearance check',()=>{
  const knob = bodies.find(p=>p.ref==='joystick')
  assert.ok(intersects(knob,{x:74.3,z:53.3,w:2.24,d:0.92,rotation:0}))
  assert.ok(!intersects(knob,bodies.find(p=>p.ref==='R12')))
})

test('photo/schematic discrete packages include the full glass diode and three-pin Q1 contacts',()=>{
  assert.equal(PASSIVES.find(p=>p.ref==='Q1').kind,'transistor')
  assert.equal(PASSIVES.find(p=>p.ref==='D1').kind,'diode')
  const q1=bodies.find(p=>p.ref==='Q1'), d1=bodies.find(p=>p.ref==='D1')
  // These lead-end probes escaped the former generic 0805 rectangle.
  assert.ok(intersects(q1,{x:q1.x+1.3,z:q1.z,w:0.3,d:0.3}))
  assert.ok(intersects(d1,{x:d1.x+1.9,z:d1.z,w:0.3,d:0.3}))
})

test('radial lead contacts land on extracted through-hole symbols rather than component-center guesses',async()=>{
  const {holes}=JSON.parse(await readFile(new URL('../public/artwork/manifest.json',import.meta.url),'utf8'))
  for(const id of ['vibration','crystal-2']) {
    const component=COMPONENTS.find(c=>c.id===id)
    assert.equal(component.contacts.length,2)
    assert.ok(component.contacts.every(([x,z])=>holes.some(h=>Math.hypot(h.x-x,h.z-z)<0.001)))
    assert.equal(Math.sign(component.contacts[0][1]-component.z),Math.sign(component.contacts[1][1]-component.z))
  }
})
