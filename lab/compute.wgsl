struct Agent { pos:vec2f, velocity:vec2f, kind:u32, prey:u32, state:u32, id:u32 }
struct Config { n:u32, grid:u32, extent:f32, pitch:f32,
  species:u32, wrap:u32, fov:u32, cadence:u32, zoom:f32, frame:u32, far:u32, battle:u32 }
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
fn delta(d:vec2f)->vec2f{
  if(cfg.wrap==0u){return d;}
  return d-floor(d/cfg.extent+.5)*cfg.extent;
}
fn portal(p:f32)->f32{
  if(p>cfg.extent-1.){return 1.+(p-cfg.extent+1.)%(cfg.extent-2.);}
  if(p<1.){return cfg.extent-1.-(1.-p)%(cfg.extent-2.);}
  return p;
}
fn visit(raw:vec2i,actor:Agent,allowed:u32,limited:bool,prev:Hit)->Hit {
  var c=raw;if(cfg.wrap!=0u){c=(raw+vec2i(i32(cfg.grid)))%vec2i(i32(cfg.grid));}
  if(any(c<vec2i(0)) || any(c>=vec2i(i32(cfg.grid)))){return prev;}
  let k=u32(c.x)+cfg.grid*u32(c.y);
  if((atomicLoad(&masks[k])&allowed)==0u){return prev;}
  var best=prev;var link=atomicLoad(&heads[k]);
  while(link!=0u){
    let id=link-1u;let a=agents[id];
    if(((1u<<a.kind)&allowed)!=0u && !(cfg.species==2u && actor.kind==1u && (a.state&0xffc0u)!=0u)){
      let diff=delta(a.pos-actor.pos);let d=dot(diff,diff);
      var visible=true;
      if(limited && d>64.){
        let facing=dot(diff,actor.velocity);let v2=dot(actor.velocity,actor.velocity);
        visible=d<=1600. && v2>0. && facing>=0. && facing*facing>=.5*d*v2;
      }
      if(visible && (d<best.d2 || (d==best.d2 && id<best.id))){best=Hit(id,d);}
    }
    link=links[id];
  }
  return best;
}
@compute @workgroup_size(64)
fn moveAgents(@builtin(global_invocation_id) gid:vec3u) {
  let i=gid.x;if(i>=cfg.n){return;}
  var a=agents[i];let c=vec2i(cell(a.pos));var allowed=1u<<((a.kind+2u)%3u);
  if(cfg.species==2u){allowed=1u<<(1u-a.kind);}
  if(cfg.species==5u){allowed=array<u32,5>(12u,17u,10u,18u,5u)[a.kind];}
  let off=any(abs(a.pos/cfg.extent-.5)*cfg.zoom>vec2f(.5));
  let reduced=cfg.cadence>1u && (cfg.far!=0u || off);
  let decide=!reduced || (cfg.frame+i)%cfg.cadence==0u;
  let limited=cfg.fov!=0u && !(reduced && cfg.far!=0u);
  var best=Hit(0xffffffffu,3.4e38);
  if(decide && (atomicLoad(&masks[cfg.grid*cfg.grid])&allowed)!=0u){
    for(var r=0;r<i32(cfg.grid);r++){
      if(cfg.wrap!=0u && r>i32((cfg.grid+1u)/2u)){break;}
      for(var x=select(max(0,c.x-r),c.x-r,cfg.wrap!=0u);x<=select(min(i32(cfg.grid)-1,c.x+r),c.x+r,cfg.wrap!=0u);x++){
        best=visit(vec2i(x,c.y-r),a,allowed,limited,best);
        if(r>0){best=visit(vec2i(x,c.y+r),a,allowed,limited,best);}
      }
      for(var y=select(max(0,c.y-r+1),c.y-r+1,cfg.wrap!=0u);y<=select(min(i32(cfg.grid)-1,c.y+r-1),c.y+r-1,cfg.wrap!=0u);y++){
        best=visit(vec2i(c.x-r,y),a,allowed,limited,best);
        if(r>0){best=visit(vec2i(c.x+r,y),a,allowed,limited,best);}
      }
      let lo=a.pos-vec2f(c-vec2i(r))*cfg.pitch;
      let hi=vec2f(c+vec2i(r+1))*cfg.pitch-a.pos;
      let lower=min(min(lo.x,lo.y),min(hi.x,hi.y));
      if(best.d2<lower*lower || (limited && lower>40.)){break;}
    }
  }
  if(decide){a.prey=best.id;}
  if(best.id!=0xffffffffu && best.d2>0){a.velocity=normalize(delta(agents[best.id].pos-a.pos))*select(24.,-24.,cfg.species==2u && a.kind==0u);}
  let pos=a.pos+a.velocity/60.;
  if(cfg.battle!=0u){a.pos=pos;}
  else if(cfg.wrap!=0u){a.pos=vec2f(portal(pos.x),portal(pos.y));}
  else{a.pos=clamp(pos,vec2f(1.),vec2f(cfg.extent-1.));
    a.velocity=select(vec2f(0.),a.velocity,pos==a.pos);}
  output[i]=a;
}
