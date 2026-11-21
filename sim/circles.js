// Fixed-step equal-mass circles in chunk-local double precision.
(() => {
  'use strict';
  function crossesView(x,y,endX,endY,view,pad){
    return Math.max(x,endX)+pad>=view.left && Math.min(x,endX)-pad<=view.right &&
      Math.max(y,endY)+pad>=view.top && Math.min(y,endY)-pad<=view.bottom;
  }
  function step(units, dt, radius, contact, view=null) {
    if (!units.length) return;
    const diameter=2*radius;
    const visible=view?new Uint8Array(units.length):null;
    let inView=0;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    let travel=0;
    const key=(x,y)=>x+','+y;
    for (let i=0;i<units.length;i++) {
      const b=units[i].body, p=b.position, v=b.velocity;
      b.previousPosition[0]=p[0];b.previousPosition[1]=p[1];
      const col=Math.floor(p[0]/diameter),row=Math.floor(p[1]/diameter);
      minX=Math.min(minX,col);maxX=Math.max(maxX,col);
      minY=Math.min(minY,row);maxY=Math.max(maxY,row);
      travel=Math.max(travel,Math.hypot(v[0],v[1])*dt);
      p[0]+=v[0]*dt;p[1]+=v[1]*dt;
      if(view && crossesView(b.previousPosition[0],b.previousPosition[1],p[0],p[1],view,radius)){
        visible[i]=1;inView++;
      }
    }
    if(view && !inView)return;
    // Use contiguous buckets for a compact arena and sparse keys for distant groups.
    // Reverse insertion keeps the CPU and GPU contact visitation order identical.
    const width=maxX-minX+1,area=width*(maxY-minY+1);
    const compact=area<=Math.max(64,16*units.length);
    const heads=compact?new Uint32Array(area):new Map();
    const next=new Uint32Array(units.length);
    let occupied=0;
    for(let i=units.length-1;i>=0;i--){
      const b=units[i].body,p=b.previousPosition;
      if(view && !visible[i] && !crossesView(p[0],p[1],b.position[0],b.position[1],view,3*radius+2*travel))continue;
      const x=Math.floor(p[0]/diameter),y=Math.floor(p[1]/diameter);
      if(compact){
        const k=(y-minY)*width+(x-minX);
        next[i]=heads[k];heads[k]=i+1;
      }else{
        const k=key(x,y);
        next[i]=heads.get(k)||0;heads.set(k,i+1);
      }
      if(!next[i])occupied++;
    }
    function resolve(i,j) {
      if(j<=i || (view && !visible[i] && !visible[j]))return;
      const a=units[i].body,b=units[j].body,p=a.position,q=b.position;
      const x0=b.previousPosition[0]-a.previousPosition[0], y0=b.previousPosition[1]-a.previousPosition[1];
      const dx=q[0]-p[0],dy=q[1]-p[1];
      let nx=dx,ny=dy,length;
      if (x0*x0+y0*y0>diameter*diameter) {
        // Swept relative segment against the sum of radii.
        const vx=dx-x0,vy=dy-y0,aa=vx*vx+vy*vy,dot=x0*vx+y0*vy;
        if (!aa || dot>=0)return;
        const disc=dot*dot-aa*(x0*x0+y0*y0-diameter*diameter);
        if(disc<0)return;
        const t=(-dot-Math.sqrt(disc))/aa;
        if(t<0 || t>1)return;
        nx=x0+t*vx;ny=y0+t*vy;length=Math.hypot(nx,ny);
      } else {
        length=Math.hypot(dx,dy);
        if(length>diameter)return;
      }
      if(length>1e-12){nx/=length;ny/=length;}
      else {nx=1;ny=0;}
      const push=Math.max(0,(diameter-dx*nx-dy*ny)/2);
      p[0]-=push*nx;p[1]-=push*ny;q[0]+=push*nx;q[1]+=push*ny;
      const va=a.velocity,vb=b.velocity, approach=(va[0]-vb[0])*nx+(va[1]-vb[1])*ny;
      if(approach>0){
        const impulse=.565*approach; // equal masses, restitution 0.13
        va[0]-=impulse*nx;va[1]-=impulse*ny;vb[0]+=impulse*nx;vb[1]+=impulse*ny;
      }
      contact(units[i],units[j]);
    }
    for(let i=0;i<units.length;i++){
      const b=units[i].body,[x,y]=b.previousPosition;
      if(view && !visible[i] && !crossesView(x,y,b.position[0],b.position[1],view,3*radius+2*travel))continue;
      const range=diameter+travel+Math.hypot(b.position[0]-x,b.position[1]-y);
      const left=Math.floor((x-range)/diameter), right=Math.floor((x+range)/diameter);
      const top=Math.floor((y-range)/diameter), bottom=Math.floor((y+range)/diameter);
      if ((right-left+1)*(bottom-top+1)>Math.max(64,occupied)){
        for(let j=i+1;j<units.length;j++)resolve(i,j);
      } else {
        const lastRow=Math.min(maxY,bottom),lastCol=Math.min(maxX,right);
        for(let row=Math.max(minY,top);row<=lastRow;row++)for(let col=Math.max(minX,left);col<=lastCol;col++){
          let entry=compact?heads[(row-minY)*width+(col-minX)]:heads.get(key(col,row));
          while(entry){const j=entry-1;resolve(i,j);entry=next[j];}
        }
      }
    }
  }
  const api={step,crossesView};
  if(typeof module!=='undefined')module.exports=api;
  else window.SwarmCircles=api;
})();
