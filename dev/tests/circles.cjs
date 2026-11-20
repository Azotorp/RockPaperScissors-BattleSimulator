'use strict';
const assert=require('node:assert/strict'),{step}=require('../sim/circles');
function run() {
  const units=[[-20,1800],[20,-1800],[80,0]].map(([x,v])=>({body:{position:[x,0],previousPosition:[x,0],velocity:[v,0]}}));
  const hits=[];
  step(units,1/60,3,(a,b)=>hits.push([units.indexOf(a),units.indexOf(b)]));
  assert.deepEqual(hits,[[0,1]]);
  assert(units[0].body.position[0]+6<=units[1].body.position[0]+1e-6);
  assert(units[0].body.velocity[0]<0);
  return units;
}
assert.deepEqual(run(),run());
console.log('PASS swept CPU circle impact and deterministic repeat');
