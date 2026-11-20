// Pure simulation helpers. World distances are independent of screen zoom.
(() => {
  'use strict';
  function randomStream(seed) {
    let state = 2166136261;
    for (const char of seed) state = Math.imul(state ^ char.codePointAt(0), 16777619) >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let n = Math.imul(state ^ state >>> 15, state | 1);
      n ^= n + Math.imul(n ^ n >>> 7, n | 61);
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(array, random) {
    for (let i=array.length-1; i>0; i--) {
      const j=Math.floor(random()*(i+1));
      [array[i],array[j]]=[array[j],array[i]];
    }
    return array;
  }
  function placements({seed, bounds, counts, radius, gap, distribution}) {
    const width=bounds.right-bounds.left, height=bounds.bottom-bounds.top;
    const separation=radius*2+gap;
    const maxCols=Math.floor(width/separation), maxRows=Math.floor(height/separation);
    const n=Object.values(counts).reduce((sum,v)=>sum+v,0);
    if(n>maxCols*maxRows) throw Error('Capacity '+(maxCols*maxRows)+' for '+n+' requested. Increase arena size, reduce the gap or lower the population.');
    if(!n) return [];
    const cols=Math.max(Math.ceil(n/maxRows),Math.min(n,maxCols,Math.round(Math.sqrt(n*width/height))||1));
    const rows=Math.ceil(n/cols), cw=width/cols, ch=height/rows;
    const rng=randomStream(seed);
    const types=shuffle(Object.entries(counts).flatMap(([kind,count])=>Array(count).fill(kind)),rng);
    const cells=shuffle(Array.from({length:rows*cols},(_,i)=>i),rng);
    return types.map((type,i)=>{
      const cell=cells[i];
      const jitter=distribution==='grid'?0:.85;
      return {type,x:bounds.left+(cell%cols+.5)*cw+(rng()-.5)*(cw-separation)*jitter,
        y:bounds.top+(Math.floor(cell/cols)+.5)*ch+(rng()-.5)*(ch-separation)*jitter};
    });
  }
  function canDetect(config, dx, dy, heading, head) {
    if(!config.fov) return true;
    const d2=dx*dx+dy*dy;
    if(d2<=(config.hearing*head)**2) return true;
    return d2<=(config.sight*head)**2 &&
      dx*Math.cos(heading)+dy*Math.sin(heading)>=Math.sqrt(d2)*Math.cos(config.angle*Math.PI/360)-1e-8;
  }
  function exposure(h,dt,contact,config) {
    // Split the tick at infection. Post-infection time earns complete bonuses only.
    let remainingTime=dt, post=contact;
    if(h.incubation===null) {
      const need=Math.max(0,config.threshold-h.exposure);
      h.exposure+=contact;
      if(h.exposure+1e-7<config.threshold) return 'human';
      h.exposure=config.threshold;h.incubation=config.incubation;h.bonusContact=0;
      post=Math.max(0,contact-need);remainingTime=Math.min(dt,post);
    }
    h.bonusContact+=post;
    const bonuses=Math.floor((h.bonusContact+1e-7)/config.bonusInterval);
    h.bonusContact=Math.max(0,h.bonusContact-bonuses*config.bonusInterval);
    h.incubation=Math.max(0,h.incubation-remainingTime-bonuses*config.bonus);
    return h.incubation<=1e-7?'convert':'infected';
  }
  // Immutable decision snapshot: drifting bodies never invalidate pruning planes.
  function trees(units) {
    const groups=new Map();
    for(const u of units) {
      const types=groups.get(u.type)||[];
      types.push({u,x:u.body.position[0],y:u.body.position[1]});
      groups.set(u.type,types);
    }
    // In-place median partition avoids sorting and copying each subtree.
    function build(points,first,last,depth) {
      if(first>last)return null;
      const axis=depth%2?'y':'x',mid=(first+last)>>1;
      let lo=first,hi=last;
      while(lo<hi) {
        const pivot=points[(lo+hi)>>1][axis];let i=lo,j=hi;
        while(i<=j){
          while(points[i][axis]<pivot)i++;
          while(points[j][axis]>pivot)j--;
          if(i<=j){const tmp=points[i];points[i++]=points[j];points[j--]=tmp;}
        }
        if(mid<=j)hi=j;else if(mid>=i)lo=i;else break;
      }
      const node=points[mid];node.axis=axis;
      node.left=build(points,first,mid-1,depth+1);node.right=build(points,mid+1,last,depth+1);
      return node;
    }
    for(const [type,points] of groups)groups.set(type,build(points,0,points.length-1,0));
    return groups;
  }
  function nearest(index,types,u,maxDistance,accept,wrap) {
    const [x,y]=u.body.position;
    let best=null,bestD2=maxDistance*maxDistance;
    function search(node,ox,oy,type) {
      if(!node)return;
      const dx=node.x-ox,dy=node.y-oy,d2=dx*dx+dy*dy;
      if(node.u!==u && d2<=bestD2 && node.u.type===type && accept(node.u,dx,dy,d2) &&
         (d2<bestD2 || !best || node.u.sequence<best.sequence)) {best=node.u;bestD2=d2;}
      const delta=node.axis==='x'?dx:dy;
      search(delta>0?node.left:node.right,ox,oy,type);
      if(delta*delta<=bestD2)search(delta>0?node.right:node.left,ox,oy,type);
    }
    for(const type of types) {
      const root=index.get(type);search(root,x,y,type);
      if(wrap && root) for(const sx of [-wrap.width,0,wrap.width]) for(const sy of [-wrap.height,0,wrap.height]) {
        if(!sx&&!sy)continue;
        const bx=Math.max(wrap.left-(x+sx),0,x+sx-wrap.right), by=Math.max(wrap.top-(y+sy),0,y+sy-wrap.bottom);
        if(bx*bx+by*by<=bestD2)search(root,x+sx,y+sy,type);
      }
    }
    return best;
  }
  const api={randomStream,placements,canDetect,exposure,trees,nearest};
  if(typeof module!=='undefined')module.exports=api;
  else window.SwarmSimulation=api;
})();
