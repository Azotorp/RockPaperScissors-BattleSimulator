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
          const n=257,extent=600,seed=SwarmLabModel.initial(n,extent,'parity');
          const cpu=SwarmLabModel.cpu(seed,extent);
          const gpu=await SwarmLabGPU.open(seed,extent,document.querySelector('canvas'));
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
          const name=gpu.name;gpu.dispose();return {adapter:name,n,steps:12,maxError:error};
        }"""),flush=True)
        await pg.evaluate("""()=>{
          const request=GPUAdapter.prototype.requestDevice;
          GPUAdapter.prototype.requestDevice=async function(...args){
            window.testDevice=await request.apply(this,args);return testDevice;
          };
          controls.requestSubmit();
        }""")
        await pg.wait_for_function("document.querySelector('output').textContent.includes('GPU ·')")
        await pg.evaluate('testDevice.destroy()')
        await pg.wait_for_function("document.querySelector('output').textContent.includes('device lost') && document.querySelector('output').textContent.includes('CPU')")
        await pg.evaluate("""()=>{Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true});controls.requestSubmit();}""")
        await pg.wait_for_function("document.querySelector('output').textContent.includes('unavailable') && document.querySelector('output').textContent.includes('CPU')")
        assert not errors,errors
        await browser.close()
        print('PASS WebGPU execution, target parity, movement tolerance, draw, device loss and missing-adapter fallback')

if __name__=='__main__': asyncio.run(main())
