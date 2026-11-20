"""Run CPU/GPU target, movement, frame rendering and device fallback checks in Chromium."""
import asyncio
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests'))
from visual_phase1 import routes, ORIGIN


async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.getenv('SWARM_CHROMIUM','/usr/bin/chromium'),
            args=['--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan',
                  '--use-vulkan=swiftshader','--disable-vulkan-surface','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx=await browser.new_context()
        await routes(ctx)
        pg=await ctx.new_page()
        errors=[]
        pg.on('pageerror',lambda e:errors.append(str(e)))
        await pg.goto(ORIGIN+'dev/lab/index.html')
        print(await pg.evaluate("""async()=>{
          for(const options of [{},{species:5,wrap:true},{species:5,fov:true},{species:5,wrap:true,fov:true},{species:5,wrap:true,fov:true,cadence:4,zoom:4}]){
          const n=257,extent=600,seed=SwarmLabModel.initial(n,extent,'parity',options.species||3);
          const cpu=SwarmLabModel.cpu(seed,extent,options);
          const gpu=await SwarmLabGPU.open(seed,extent,document.querySelector('canvas'),null,options);
          let error=0;
          for(let step=0;step<12;step++){
            cpu.step();gpu.step();gpu.draw();
            const snap=await gpu.snapshot(),a=new Float32Array(cpu.data),b=new Float32Array(snap);
            const ai=new Uint32Array(cpu.data),bi=new Uint32Array(snap);
            for(let i=0;i<n;i++){
              const j=8*i;
              if(ai[j+5]!==bi[j+5] || bi[j+7]!==i)throw Error('GPU target or ID at '+i);
              for(let k=0;k<4;k++)error=Math.max(error,Math.abs(a[j+k]-b[j+k]));
            }
          }
          if(!(error<.005))throw Error('GPU movement diverged: '+error);
          gpu.dispose();}
          return 'Passed 12-step parity in five perception, portal, species and LOD configurations';
        }"""),flush=True)
        print(await pg.evaluate("""async()=>{
          const fixture=async (points,species,expected,steps=1) => {
            const seed=SwarmLabModel.initial(points.length,100,'order',species);
            const f=new Float32Array(seed),u=new Uint32Array(seed);
            for(let i=0;i<points.length;i++){
              const [x,y,kind,state=0]=points[i],j=8*i;
              f.set([x,y,0,0],j);u[j+4]=kind;u[j+6]=state;
            }
            const options={species,battle:true};
            const cpu=SwarmLabModel.cpu(seed,100,options);
            const gpu=await SwarmLabGPU.open(seed,100,null,null,options);
            try {
              for(let i=0;i<steps;i++){cpu.step();gpu.step();}
              const snap=await gpu.snapshot(),actual=new Uint32Array(snap),ref=new Uint32Array(cpu.data);
              const pos=new Float32Array(snap),cpuPos=new Float32Array(cpu.data);
              for(let i=0;i<points.length;i++){
                const j=i*8;
                if(actual[j+4]!==ref[j+4] || actual[j+6]!==ref[j+6] || actual[j+4]!==expected[i] || actual[j+7]!==i)
                  throw Error('Contact outcome at '+i+' actual '+[actual[j+4],actual[j+6]]+' CPU '+[ref[j+4],ref[j+6]]+' expected species '+expected[i]);
                for(let k=0;k<4;k++)if(!(Math.abs(pos[j+k]-cpuPos[j+k])<.002))
                  throw Error('Body difference at '+i);
              }
              return actual;
            }finally{gpu.dispose();}
          };
          // The scissors in the previous cell (#2) is visited before #1.
          await fixture([[50,50,0],[51,50,2],[49,50,2]],3,[0,2,0]);
          await fixture([[50,50,4],[51,50,2],[49,50,0]],5,[4,2,4]);
          const bite=await fixture([[50,50,0,59],[51,50,1],[49,50,1]],2,[0,1,1]);
          if(bite[6]!==((600<<6)|60))throw Error('Duplicate bites or threshold drift');
          const bonus=await fixture([[50,50,0,60|(100<<6)|(59<<16)],[51,50,1]],2,[0,1]);
          if(bonus[6]!==((39<<6)|60))throw Error('Bonus incubation timing');
          await fixture([[50,50,0,60|(1<<6)],[75,50,1]],2,[1,1]);
          const chain=Array.from({length:35},(_,i)=>[10+2.4*i,50,0]);
          chain[17]=[55,60,0];chain[18]=[56,60,2];chain[19]=[54,60,2];
          const reference=chain.map(p=>p[2]);reference[19]=0;
          await fixture(chain,3,reference);
          return 'PASS CPU-ordered GPU circle contacts, higher-ID first tie, later dispatch block, one-conversion locks, merged bites, infection and incubation';
        }"""),flush=True)
        print(await pg.evaluate("""async()=>{
          const rows=[];
          for (const n of [128,1024]){
            for (const species of [3,5,2]){
              const extent=Math.ceil(Math.sqrt(n)*4),opts={battle:true,species};
              const seed=SwarmLabModel.initial(n,extent,'battle-measure',species);
              const gpu=await SwarmLabGPU.open(seed,extent,document.querySelector('canvas'),null,opts);
              const cpu=SwarmLabModel.cpu(seed,extent,opts);
              try{
                const start=performance.now();cpu.step();const cpuMs=performance.now()-start;
                const t=performance.now();gpu.step();await gpu.settle();const gpuMs=performance.now()-t;
                const drawStart=performance.now();gpu.draw();await gpu.settle();const drawMs=performance.now()-drawStart;
                const snap=await gpu.snapshot(),bits=new Uint32Array(snap),reference=new Uint32Array(cpu.data);
                const f=new Float32Array(snap),cf=new Float32Array(cpu.data),initial=new Uint32Array(seed);
                let maxError=0,changed=0;
                for(let i=0;i<n;i++){
                  const j=i*8;
                  if(bits[j+7]!==i || bits[j+4]!==reference[j+4] || bits[j+6]!==reference[j+6])throw Error('Batch mismatch '+[n,species,i,bits[j+4],reference[j+4],bits[j+6],reference[j+6]]);
                  if(bits[j+4]!==initial[j+4])changed++;
                  for(let k=0;k<4;k++)maxError=Math.max(maxError,Math.abs(cf[j+k]-f[j+k]));
                }
                if(!(maxError<.005))throw Error('Batch body drift '+[maxError,n,species]);
                rows.push({n,species,changed,maxError,cpuMs,gpuMs,drawMs});
              }finally{gpu.dispose();}
            }
          }
          return rows;
        }"""),flush=True)
        await pg.select_option('#species','battle3')
        await pg.fill('#population','1025')
        await pg.get_by_role('button',name='Start run').click()
        await pg.wait_for_function("document.querySelector('#status').textContent.includes('1,024')")
        await pg.select_option('#backend','GPU')
        await pg.fill('#population','1024')
        await pg.evaluate("""()=>{
          const request=GPUAdapter.prototype.requestDevice;
          GPUAdapter.prototype.requestDevice=async function(...args){
            window.testDevice=await request.apply(this,args);return testDevice;
          };
          controls.requestSubmit();
        }""")
        await pg.wait_for_function("document.querySelector('output').textContent.includes('GPU ·')")
        await pg.locator('#pause').click()
        await pg.screenshot(path=str(ROOT/'dev/tests/previews/ordered-contacts.png'))
        await pg.locator('#pause').click()
        await pg.evaluate('testDevice.destroy()')
        await pg.wait_for_function("document.querySelector('output').textContent.includes('device lost') && document.querySelector('output').textContent.includes('CPU')")
        await pg.evaluate("""()=>{Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true});controls.requestSubmit();}""")
        await pg.wait_for_function("document.querySelector('output').textContent.includes('unavailable') && document.querySelector('output').textContent.includes('CPU')")
        assert not errors,errors
        await browser.close()
        print('PASS WebGPU execution, target parity, movement tolerance, draw, device loss and missing-adapter fallback')

if __name__=='__main__': asyncio.run(main())
