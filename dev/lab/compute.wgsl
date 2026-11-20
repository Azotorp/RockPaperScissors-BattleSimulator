struct Agent { pos:vec2f, velocity:vec2f, kind:u32, prey:u32, state:u32, id:u32 }
struct Config { n:u32, grid:u32, extent:f32, pitch:f32 }
@group(0) @binding(0) var<uniform> cfg:Config;
@group(0) @binding(1) var<storage,read> agents:array<Agent>;
@group(0) @binding(2) var<storage,read_write> output:array<Agent>;
@group(0) @binding(3) var<storage,read_write> heads:array<atomic<u32>>;
@group(0) @binding(4) var<storage,read_write> links:array<u32>;
@group(0) @binding(5) var<storage,read_write> masks:array<atomic<u32>>;
// Slot grid² in masks holds the global species mask. Zero is an empty list.
fn cell(pos:vec2f)->vec2u {
  return vec2u(clamp(floor(pos/cfg.pitch),vec2f(0),vec2f(f32(cfg.grid-1u))));
}
@compute @workgroup_size(64)
fn indexAgents(@builtin(global_invocation_id) gid:vec3u) {
  let i=gid.x;if(i>=cfg.n){return;}
  let a=agents[i];let c=cell(a.pos);let k=c.x+c.y*cfg.grid;
  links[i]=atomicExchange(&heads[k],i+1u);
  let bit=1u<<a.kind;
  atomicOr(&masks[k],bit);atomicOr(&masks[cfg.grid*cfg.grid],bit);
}
struct Hit { id:u32, d2:f32 }
fn visit(c:vec2i,pos:vec2f,prey:u32,prev:Hit)->Hit {
  if(any(c<vec2i(0)) || any(c>=vec2i(i32(cfg.grid)))){return prev;}
  let k=u32(c.x)+cfg.grid*u32(c.y);
  if((atomicLoad(&masks[k])&(1u<<prey))==0u){return prev;}
  var best=prev;var link=atomicLoad(&heads[k]);
  while(link!=0u){
    let id=link-1u;let a=agents[id];
    if(a.kind==prey){
      let diff=a.pos-pos;let d=dot(diff,diff);
      if(d<best.d2 || (d==best.d2 && id<best.id)){best=Hit(id,d);}
    }
    link=links[id];
  }
  return best;
}
@compute @workgroup_size(64)
fn moveAgents(@builtin(global_invocation_id) gid:vec3u) {
  let i=gid.x;if(i>=cfg.n){return;}
  var a=agents[i];let c=vec2i(cell(a.pos));let prey=(a.kind+2u)%3u;
  var best=Hit(0xffffffffu,3.4e38);
  if((atomicLoad(&masks[cfg.grid*cfg.grid])&(1u<<prey))!=0u){
    for(var r=0;r<i32(cfg.grid);r++){
      for(var x=max(0,c.x-r);x<=min(i32(cfg.grid)-1,c.x+r);x++){
        best=visit(vec2i(x,c.y-r),a.pos,prey,best);
        if(r>0){best=visit(vec2i(x,c.y+r),a.pos,prey,best);}
      }
      for(var y=max(0,c.y-r+1);y<=min(i32(cfg.grid)-1,c.y+r-1);y++){
        best=visit(vec2i(c.x-r,y),a.pos,prey,best);
        if(r>0){best=visit(vec2i(c.x+r,y),a.pos,prey,best);}
      }
      let lo=a.pos-vec2f(c-vec2i(r))*cfg.pitch;
      let hi=vec2f(c+vec2i(r+1))*cfg.pitch-a.pos;
      let lower=min(min(lo.x,lo.y),min(hi.x,hi.y));
      if(best.d2<lower*lower){break;}
    }
  }
  a.prey=best.id;
  if(best.id!=0xffffffffu && best.d2>0){a.velocity=normalize(agents[best.id].pos-a.pos)*24.;}
  let pos=a.pos+a.velocity/60.;a.pos=clamp(pos,vec2f(1.),vec2f(cfg.extent-1.));
  a.velocity=select(vec2f(0.),a.velocity,pos==a.pos);
  output[i]=a;
}
