'use strict';
const assert=require('node:assert/strict');
const plan=require('../sim/resize');
const {rectangle}=require('../sim/boundary');
const agent=(x,y)=>({body:{position:[x,y]}});
const old=rectangle(0,0,1000,1000), next=rectangle(0,0,200,200);
const fixed=agent(100,100), tangent=agent(5,5), partial=agent(196,50);
const crowd=Array.from({length:40},()=>agent(500,500));
for (const mode of ['walls','wrap']) {
  const input=[fixed,tangent,partial,...crowd], moves=plan(input,old,next,5,mode);
  assert.deepEqual(moves,plan(input,old,next,5,mode));
  assert.equal(moves.length,41);
  assert(moves.every(m=>m.agent!==fixed && m.agent!==tangent));
  assert.deepEqual([moves[0].x,moves[0].y],[39.2,10]);
  const placed=[fixed.body.position,tangent.body.position];
  for(const {x,y} of moves){
    for(const [px,py] of placed)assert(Math.hypot(px-x,py-y)>=10);
    placed.push([x,y]);
  }
  assert.throws(()=>plan(input,old,rectangle(0,0,12,12),5,mode),/cancelled/);
  assert.deepEqual(fixed.body.position,[100,100]);
}
assert.deepEqual(plan(crowd,old,next,5,'none'),[]);
console.log('PASS outside-only relocation, tangency, proportional mapping, crowd separation, deterministic rejection and unbounded mode');
