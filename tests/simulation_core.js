'use strict';
const assert=require('node:assert/strict');
const {placements,randomStream,trees,nearest,exposure,canDetect}=require('../sim/core.js');
const bounds={left:-500,right:500,top:-400,bottom:400,width:1000,height:800};
for(const counts of [{rock:12,paper:12,scissors:12},{rock:12,paper:3,scissors:8,lizard:8,spock:14},{human:30,zombie:1}]){
  const opts={seed:'Azo / test',bounds,counts,radius:10,gap:2,distribution:'jitter'};
  const result=placements(opts);
  assert.deepEqual(result,placements(opts));
  assert.notDeepEqual(result,placements({...opts,seed:'next'}));
  for(const [kind,n] of Object.entries(counts))assert.equal(result.filter(q=>q.type===kind).length,n);
  for(const [i,a] of result.entries()){
    assert(a.x>=bounds.left+10 && a.x<=bounds.right-10 && a.y>=bounds.top+10 && a.y<=bounds.bottom-10);
    for(const b of result.slice(i+1)){
      const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
      assert(Math.hypot(Math.min(dx,1000-dx),Math.min(dy,800-dy))>=22-1e-8);
    }
  }
}
assert.throws(()=>placements({seed:'s',bounds,counts:{a:15000},radius:10,gap:5}),/Capacity/);
const rng=randomStream('kd'), kinds=['rock','paper','scissors','lizard','spock','human','zombie'];
const units=Array.from({length:600},(_,i)=>({sequence:i,type:kinds[i%7],body:{position:[rng()*1000-500,rng()*800-400]},eligible:i%5!==0}));
units.push({sequence:601,type:'paper',body:{position:[100000,200000]},eligible:true});
const index=trees(units);
for(const fov of [true,false])for(const u of units.slice(0,100))for(const type of kinds){
  const sensor={fov,angle:70,sight:14,hearing:2};
  const accept=(q,dx,dy)=>q.eligible&&canDetect(sensor,dx,dy,1,8);
  const brute=units.filter(q=>q!==u&&q.type===type).map(q=>[q,q.body.position[0]-u.body.position[0],q.body.position[1]-u.body.position[1]])
    .filter(([q,x,y])=>accept(q,x,y)).sort((a,b)=>Math.hypot(a[1],a[2])-Math.hypot(b[1],b[2]))[0]?.[0]||null;
  assert.equal(nearest(index,[type],u,Infinity,accept,null),brute);
}
const human=()=>({incubation:null,exposure:0,bonusContact:0}),h=human(),cfg={threshold:1000,incubation:10000,bonusInterval:1000,bonus:1000};
for(const [dt,on] of [[450,450],[800,0],[549,549]])assert.equal(exposure(h,dt,on,cfg),'human');
assert.equal(exposure(h,1,1,cfg),'infected');assert.equal(h.incubation,10000);
exposure(h,999,999,cfg);assert.equal(h.incubation,9001);
exposure(h,1,1,cfg);assert.equal(h.incubation,8000);
assert.equal(exposure(h,8000,0,cfg),'convert');
console.log('PASS deterministic placement, counts, toroidal separation, capacity, exact eligible KD nearest vs brute force in 1,400 queries, exposure and incubation thresholds');
