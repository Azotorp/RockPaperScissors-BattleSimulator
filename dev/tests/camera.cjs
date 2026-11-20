'use strict';
const assert=require('node:assert/strict');
const C=require('../sim/camera');
for(const [w,h] of [[1200,760],[390,844]]) for(const m of [.005,.024,.1]) {
  const z=C.minZoom(w,h,m);
  assert(w*m/z>=2e9-.001 && h*m/z>=2e9-.001);
  for(const zoom of [1,1e5,1e-5,z]) {
    const start=1e9/m+.25, step=100*m/zoom;
    const ticks=C.ticks(start,m,step,zoom,w);
    assert(ticks.length<=w/100+3);
    for(let i=1;i<ticks.length;i++)assert(Math.abs(ticks[i].px-ticks[i-1].px-100)<1e-6);
  }
}
console.log('PASS camera span, large-origin grid stability and viewport-bounded tick counts');
