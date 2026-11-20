'use strict';
const assert=require('node:assert/strict');
global.window={}; global.SwarmSimulation=require('../sim/core');
require('../lab/model');
const model=window.SwarmLabModel;
for(const wrap of [false,true])for(const fov of [false,true])for(const species of [3,5]){
  const extent=140,n=212,seed=model.initial(n,extent,'oracle',species);
  const packed=new Float32Array(seed),ids=new Uint32Array(seed);
  const masks=species===5?[12,17,10,18,5]:[4,1,2];
  const norm=d=>wrap?d-Math.floor(d/extent+.5)*extent:d;
  const sim=model.cpu(seed,extent,{wrap,fov,species});
  const zoomed=model.cpu(seed,extent,{wrap,fov,species,zoom:4});
  sim.step();zoomed.step();
  assert.deepEqual(new Uint32Array(sim.data),new Uint32Array(zoomed.data),'exact view invariance');
  for(let i=0;i<n;i++){
    const j=i*8;let best=0xffffffff,square=Infinity;
    for(let q=0;q<n;q++){
      const k=q*8;
      if(!(masks[ids[j+4]]&(1<<ids[k+4])))continue;
      const dx=norm(packed[k]-packed[j]),dy=norm(packed[k+1]-packed[j+1]),d=dx*dx+dy*dy;
      if(fov && d>64){
        const dot=dx*packed[j+2]+dy*packed[j+3];
        if(d>1600 || dot<0 || dot*dot<d*(packed[j+2]**2+packed[j+3]**2)/2)continue;
      }
      if(d<square){square=d;best=q;}
    }
    assert.equal(new Uint32Array(sim.data)[j+5],best);
  }
}
console.log('PASS 1,696 exact target queries vs brute force, wrapped FOV, five species and offscreen invariance');
