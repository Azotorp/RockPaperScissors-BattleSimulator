// Fixed-step equal-mass circles in chunk-local double precision.
(() => {
  'use strict';
  function step(units, dt, radius, contact) {
    const diameter=2*radius, buckets=new Map();
    let travel=0;
    const key=(x,y)=>x+','+y;
    for (let i=0;i<units.length;i++) {
      const b=units[i].body, p=b.position, v=b.velocity;
      b.previousPosition[0]=p[0];b.previousPosition[1]=p[1];
      const k=key(Math.floor(p[0]/diameter),Math.floor(p[1]/diameter));
      if (!buckets.has(k)) buckets.set(k,[]);
      buckets.get(k).push(i);
      travel=Math.max(travel,Math.hypot(v[0],v[1])*dt);
      p[0]+=v[0]*dt;p[1]+=v[1]*dt;
    }
    function resolve(i,j) {
      if(j<=i)return;
      const a=units[i].body,b=units[j].body,p=a.position,q=b.position;
      const x0=b.previousPosition[0]-a.previousPosition[0], y0=b.previousPosition[1]-a.previousPosition[1];
      const dx=q[0]-p[0],dy=q[1]-p[1];
      let nx=dx,ny=dy,length=Math.hypot(dx,dy);
      if (x0*x0+y0*y0>diameter*diameter) {
        // Swept relative segment against the sum of radii.
        const vx=dx-x0,vy=dy-y0,aa=vx*vx+vy*vy,dot=x0*vx+y0*vy;
        if (!aa || dot>=0)return;
        const disc=dot*dot-aa*(x0*x0+y0*y0-diameter*diameter);
        if(disc<0)return;
        const t=(-dot-Math.sqrt(disc))/aa;
        if(t<0 || t>1)return;
        nx=x0+t*vx;ny=y0+t*vy;length=Math.hypot(nx,ny);
      } else if(length>diameter) return;
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
      const range=diameter+travel+Math.hypot(b.position[0]-x,b.position[1]-y);
      const left=Math.floor((x-range)/diameter), right=Math.floor((x+range)/diameter);
      const top=Math.floor((y-range)/diameter), bottom=Math.floor((y+range)/diameter);
      if ((right-left+1)*(bottom-top+1)>Math.max(64,buckets.size)){
        for(let j=i+1;j<units.length;j++)resolve(i,j);
      } else for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++){
        const occupants=buckets.get(key(col,row));
        if(occupants)for(const j of occupants)resolve(i,j);
      }
    }
  }
  const api={step};
  if(typeof module!=='undefined')module.exports=api;
  else window.SwarmCircles=api;
})();
