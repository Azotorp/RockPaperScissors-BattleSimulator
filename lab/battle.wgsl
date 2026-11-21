// The cell index is built in reverse insertion order. Traversing a bucket
// therefore visits actors in the same order as SwarmCircles.step.
struct Agent { pos:vec2f, velocity:vec2f, kind:u32, prey:u32, state:u32, id:u32 }
struct Config { n:u32, grid:u32, extent:f32, pitch:f32, species:u32 }
struct Stats { occupied:u32, travel:f32 }
@group(0) @binding(0) var<uniform> cfg:Config;
@group(0) @binding(1) var<storage,read> old:array<Agent>;
@group(0) @binding(2) var<storage,read_write> work:array<Agent>;
@group(0) @binding(3) var<storage,read_write> heads:array<u32>;
@group(0) @binding(4) var<storage,read_write> next:array<u32>;
@group(0) @binding(5) var<storage,read_write> flags:array<u32>;
@group(0) @binding(6) var<storage,read_write> stats:Stats;
@group(0) @binding(7) var<uniform> chunk:vec4u;
fn side()->u32{return u32(ceil(cfg.extent/2.));}

@compute @workgroup_size(1)
fn prepare(){
  stats=Stats(0u,0.);
  for(var count=cfg.n;count>0u;count--){
    let i=count-1u;let c=vec2u(floor(old[i].pos/2.));let k=c.x+c.y*side();
    if(heads[k]==0u){stats.occupied++;}
    next[i]=heads[k];heads[k]=i+1u;flags[i]=0u;
    stats.travel=max(stats.travel,length(work[i].velocity)/60.);
  }
}

fn pair(i:u32,j:u32){
  if(j<=i){return;}
  let start=old[j].pos-old[i].pos;
  let end=work[j].pos-work[i].pos;
  var normal=end;
  if(dot(start,start)>4.){
    let travel=end-start;let aa=dot(travel,travel);let approach=dot(start,travel);
    if(aa==0. || approach>=0.){return;}
    let disc=approach*approach-aa*(dot(start,start)-4.);
    if(disc<0.){return;}
    let t=(-approach-sqrt(disc))/aa;if(t<0. || t>1.){return;}
    normal=start+t*travel;
  }else if(dot(end,end)>4.){return;}
  if(length(normal)>1e-12){normal=normalize(normal);}else{normal=vec2f(1,0);}
  let correction=max(0.,(2.-dot(end,normal))*.5)*normal;
  work[i].pos-=correction;work[j].pos+=correction;
  let impulse=max(0.,dot(work[i].velocity-work[j].velocity,normal))*.565*normal;
  work[i].velocity-=impulse;work[j].velocity+=impulse;

  let a=old[i].kind;let b=old[j].kind;
  if(a==b){return;}
  if(cfg.species==2u){flags[select(j,i,a==0u)]=1u;return;}
  if(flags[i]!=0u || flags[j]!=0u){return;}
  let wins=(array<u32,5>(12u,17u,10u,18u,5u)[a]&(1u<<b))!=0u;
  work[select(i,j,wins)].kind=select(b,a,wins);
  flags[i]=1u;flags[j]=1u;
}

@compute @workgroup_size(1)
fn contacts(){
  // A dispatch represents one ordered block. The following pass observes
  // every positional correction and participant lock from the prior block.
  for(var i=chunk.x;i<min(cfg.n,chunk.x+16u);i++){
    let p=old[i].pos;
    let reach=2.+stats.travel+length(work[i].pos-p);
    let lo=vec2i(floor((p-reach)/2.));let hi=vec2i(floor((p+reach)/2.));
    if(u32((hi.x-lo.x+1)*(hi.y-lo.y+1))>max(64u,stats.occupied)){
      for(var j=i+1u;j<cfg.n;j++){pair(i,j);}
    }else{
      for(var y=max(0,lo.y);y<=min(i32(side())-1,hi.y);y++){
        for(var x=max(0,lo.x);x<=min(i32(side())-1,hi.x);x++){
          var link=heads[u32(x)+u32(y)*side()];
          while(link!=0u){let j=link-1u;pair(i,j);link=next[j];}
        }
      }
    }
  }
}
@compute @workgroup_size(64)
fn finish(@builtin(global_invocation_id) gid:vec3u){
  let i=gid.x;if(i>=cfg.n){return;}
  let p=work[i].pos;let v=work[i].velocity;
  work[i].pos=clamp(p,vec2f(1.),vec2f(cfg.extent-1.));
  work[i].velocity=select(v,vec2f(0.),((p<vec2f(1.)) & (v<vec2f(0.))) | ((p>vec2f(cfg.extent-1.)) & (v>vec2f(0.))));
  if(cfg.species!=2u || old[i].kind!=0u){return;}
  let state=old[i].state;var exposure=state&63u;var remain=(state>>6u)&1023u;var bonus=state>>16u;
  if(remain==0u){
    exposure+=flags[i];if(exposure>=60u){remain=600u;}
  }else{
    remain--;bonus+=flags[i];
    if(bonus>=60u){remain-=min(remain,60u);bonus-=60u;}
    if(remain==0u){work[i].kind=1u;work[i].state=0u;return;}
  }
  work[i].state=exposure|(remain<<6u)|(bonus<<16u);
}
