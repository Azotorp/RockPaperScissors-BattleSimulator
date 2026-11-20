'use strict';
const assert=require('node:assert/strict'),{step}=require('../sim/circles');
function run(speed=1800) {
  const units=[[-20,speed],[20,-speed],[80,0]].map(([x,v])=>({body:{position:[x,0],previousPosition:[x,0],velocity:[v,0]}}));
  const hits=[];
  step(units,1/60,3,(a,b)=>hits.push([units.indexOf(a),units.indexOf(b)]));
  assert.deepEqual(hits,[[0,1]]);
  assert(units[0].body.position[0]+6<=units[1].body.position[0]+1e-6);
  assert(units[0].body.velocity[0]<0);
  return units;
}
assert.deepEqual(run(),run());
run(1300);
console.log('PASS swept CPU circle impact and deterministic repeat');

// A distant fourth body selects sparse storage without changing the local tie.
for(const far of [8,1e9]){
  const units=[0,1,-1,far].map(x=>({body:{position:[x,0],previousPosition:[0,0],velocity:[0,0]}}));
  const order=[];
  step(units,1/60,1,(a,b)=>order.push([units.indexOf(a),units.indexOf(b)]));
  assert.deepEqual(order.slice(0,2),[[0,2],[0,1]]);
}
