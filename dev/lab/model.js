// Packed 32-byte records are shared by the CPU reference and GPU storage buffers.
// World coordinates in this prototype are local to [0,extent] on each axis.
(() => {
  const stride=8, size=32, speed=24, radius=1;
  function initial(n,extent,seed=1) {
    const data=new ArrayBuffer(n*size), f=new Float32Array(data), u=new Uint32Array(data);
    const random=SwarmSimulation.randomStream(seed);
    for(let i=0;i<n;i++){
      const j=i*stride, angle=random()*2*Math.PI;
      f[j]=radius+random()*(extent-2*radius);f[j+1]=radius+random()*(extent-2*radius);
      f[j+2]=speed*Math.cos(angle);f[j+3]=speed*Math.sin(angle);
      u[j+4]=i%3;u[j+5]=0xffffffff;u[j+7]=i;
    }
    return data;
  }
  function cpu(data,extent) {
    const n=data.byteLength/size, grid=Math.max(1,Math.ceil(Math.sqrt(n/8)));
    let src=data.slice(0), dst=new ArrayBuffer(data.byteLength);
    const heads=new Int32Array(grid*grid), next=new Int32Array(n), masks=new Uint32Array(heads.length);
    function step(){
      const f=new Float32Array(src),u=new Uint32Array(src),out=new Float32Array(dst),bits=new Uint32Array(dst);
      const pitch=extent/grid;
      const cell=p=>Math.max(0,Math.min(grid-1,Math.floor(p/pitch)));
      heads.fill(-1);masks.fill(0);let species=0;
      for(let i=0;i<n;i++){
        const j=i*stride,k=cell(f[j])+grid*cell(f[j+1]),bit=1<<u[j+4];
        next[i]=heads[k];heads[k]=i;masks[k]|=bit;species|=bit;
      }
      for(let i=0;i<n;i++){
        const j=i*stride,x=f[j],y=f[j+1],cx=cell(x),cy=cell(y);
        const prey=(u[j+4]+2)%3,bit=1<<prey;
        let best=-1,d2=Infinity;
        function visit(ix,iy){
          if(ix<0||ix>=grid||iy<0||iy>=grid)return;
          const k=iy*grid+ix;
          if(!(masks[k]&bit))return;
          for(let q=heads[k];q>=0;q=next[q]){
            const o=q*stride;
            if(u[o+4]!==prey)continue;
            const dx=f[o]-x,dy=f[o+1]-y,d=dx*dx+dy*dy;
            if(d<d2||(d===d2 && q<best)){d2=d;best=q;}
          }
        }
        if(species&bit) for(let r=0;r<grid;r++){
          for(let col=Math.max(0,cx-r);col<=Math.min(grid-1,cx+r);col++){
            visit(col,cy-r);if(r)visit(col,cy+r);
          }
          for(let row=Math.max(0,cy-r+1);row<=Math.min(grid-1,cy+r-1);row++){
            visit(cx-r,row);if(r)visit(cx+r,row);
          }
          const lower=Math.min(x-(cx-r)*pitch,(cx+r+1)*pitch-x,y-(cy-r)*pitch,(cy+r+1)*pitch-y);
          if(d2<lower*lower)break;
        }
        let vx=f[j+2],vy=f[j+3];
        if(best>=0 && d2>0){
          const factor=speed/Math.sqrt(d2);
          vx=(f[best*stride]-x)*factor;vy=(f[best*stride+1]-y)*factor;
        }
        const px=x+vx/60,py=y+vy/60;
        out[j]=Math.max(radius,Math.min(extent-radius,px));out[j+1]=Math.max(radius,Math.min(extent-radius,py));
        out[j+2]=px>=radius&&px<=extent-radius?vx:0;
        out[j+3]=py>=radius&&py<=extent-radius?vy:0;
        bits[j+4]=u[j+4];bits[j+5]=best;bits[j+6]=0;bits[j+7]=i;
      }
      [src,dst]=[dst,src];
    }
    return {step,get data(){return src;},grid};
  }
  window.SwarmLabModel={initial,cpu,size,stride};
})();
