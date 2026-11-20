"""Measure completed GPU work and explicit transfers separately from drawing."""
import asyncio
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests'))
from visual_phase1 import routes, ORIGIN


async def main():
    async with async_playwright() as p:
        for n in (1000,10000,100000,1000000):
            browser=await p.chromium.launch(executable_path=os.getenv('SWARM_CHROMIUM','/usr/bin/chromium'),
                args=['--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan',
                      '--use-vulkan=swiftshader','--disable-vulkan-surface','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            ctx=await browser.new_context()
            await routes(ctx)
            pg=await ctx.new_page()
            await pg.goto(ORIGIN+'dev/lab/index.html')
            result=await pg.evaluate("""async n=>{
              const extent=Math.ceil(Math.sqrt(n)*5),seed=SwarmLabModel.initial(n,extent,'benchmark');
              const cpu=SwarmLabModel.cpu(seed,extent);
              const clock=()=>performance.now();
              cpu.step();let t=clock();cpu.step();const cpuMs=clock()-t;
              t=clock();const gpu=await SwarmLabGPU.open(seed,extent,document.querySelector('canvas'));
              await gpu.settle();const initMs=clock()-t;
              gpu.step();await gpu.settle();
              t=clock();gpu.step();await gpu.settle();const computeMs=clock()-t;
              t=clock();gpu.draw();await gpu.settle();const drawMs=clock()-t;
              t=clock();const data=await gpu.snapshot();const downloadMs=clock()-t;
              const ints=new Uint32Array(data),f=new Float32Array(data),ref=new Uint32Array(cpu.data);
              let invalid=0,targetDifferences=0;
              for(let i=0;i<n;i++){
                const j=i*8;
                if(ints[j+7]!==i || !Number.isFinite(f[j]+f[j+1]) || ints[j+5]>=n)invalid++;
                if(ints[j+5]!==ref[j+5])targetDifferences++;
              }
              const bytes=gpu.bytes,adapter=gpu.name;gpu.dispose();
              return {n,adapter,cpuMs,initMs,computeMs,drawMs,downloadMs,bytes,invalid,targetDifferences};
            }""",n)
            print(json.dumps(result),flush=True)
            await browser.close()

if __name__=='__main__':asyncio.run(main())
