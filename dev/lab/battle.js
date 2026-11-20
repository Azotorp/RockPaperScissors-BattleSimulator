// Ordered lab battles share the main arena's CPU contact stream. The GPU
// implementation traverses the same diameter-sized cells and occupancy lists.
window.SwarmLabBattle=(()=>{
  const limit=1024, tickMs=1000/60;
  const outbreakDefaults={threshold:1000,incubation:10000,bonusInterval:1000,bonus:1000};
  const masks=[12,17,10,18,5];
  function check(n,extent,wrap){
    if(n>limit || Math.ceil(extent/2)**2>1e6)throw Error('Ordered contact runs support up to 1,024 creatures and 2,000 local units per side.');
    if(wrap)throw Error('Ordered contact runs currently require Solid walls.');
  }
  function resolve(before,after,extent,outbreak){
    const src=new Float32Array(before), old=new Uint32Array(before);
    const dst=new Float32Array(after), result=new Uint32Array(after);
    const n=src.length/8, used=new Uint8Array(n), bitten=new Uint8Array(n);
    const units=Array.from({length:n},(_,i)=>{
      const j=8*i;
      return {i,body:{position:[src[j],src[j+1]],previousPosition:[0,0],velocity:[dst[j+2],dst[j+3]]}};
    });
    SwarmCircles.step(units,1/60,1,(a,b)=>{
      const i=a.i,k=b.i,kind=old[i*8+4],other=old[k*8+4];
      if(kind===other)return;
      if(outbreak){bitten[kind===0?i:k]=1;return;}
      if(used[i] || used[k])return;
      const wins=(masks[kind]&(1<<other))!==0;
      result[(wins?k:i)*8+4]=wins?kind:other;
      used[i]=used[k]=1;
    });
    const bounds={left:0,right:extent,top:0,bottom:extent};
    for(const {i,body} of units){
      const j=i*8;
      SwarmBoundary.constrain(body.position,body.velocity,bounds,1,'walls');
      dst.set(body.position,j);dst.set(body.velocity,j+2);
      if(!outbreak || old[j+4]!==0)continue;
      const state=old[j+6], remaining=(state>>>6)&1023;
      const h={exposure:(state&63)*tickMs,incubation:remaining?remaining*tickMs:null,bonusContact:(state>>>16)*tickMs};
      const status=SwarmSimulation.exposure(h,tickMs,bitten[i]?tickMs:0,outbreakDefaults);
      if(status==='convert'){result[j+4]=1;result[j+6]=0;}
      else result[j+6]=Math.round(h.exposure/tickMs) | (Math.round((h.incubation||0)/tickMs)<<6) | (Math.round(h.bonusContact/tickMs)<<16);
    }
  }
  return {check,resolve,limit};
})();
