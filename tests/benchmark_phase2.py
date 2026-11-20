"""Real Pixi/p2 benchmark. Run with the same browser and CDN settings as visual_phase1.py."""
import asyncio
import json
import os
from playwright.async_api import async_playwright
from visual_phase1 import routes, ready

async def bench():
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.getenv('SWARM_CHROMIUM','/usr/bin/chromium'),
            args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-precise-memory-info'])
        for n,extent in [(1000,1.5),(5000,3.25),(10000,4.5)]:
            ctx=await browser.new_context(viewport={'width':1200,'height':760})
            await routes(ctx)
            await ctx.add_init_script('window.__forceSwarmDebug=true')
            pg=await ctx.new_page();await ready(pg)
            await pg.evaluate("""([n,e])=>{
              const s=SwarmSettings; s.setSetting('game.mode','5');
              for(const [k,v] of Object.entries({population:n/5,arenaScale:e,seedMode:'fixed',seed:'bench-v1',markerThreshold:2,maxSteps:3,
                 camera:{zoom:1/e,x:600*(1-1/e),y:380*(1-1/e)}}))s.setSetting('modes.5.'+k,v);
              document.querySelector('#reset').click()
            }""",[n,extent])
            await pg.wait_for_function("n=>!__swarmInputDebug.round().preparing && __swarmInputDebug.round().count===n",arg=n,timeout=120000)
            data=await pg.evaluate("""async()=>{
              const d=__swarmInputDebug, frame=()=>new Promise(requestAnimationFrame);
              document.querySelector('#run').click();for(let i=0;i<8;i++)await frame();
              const before=d.profile(true),frames=[];let last=await frame();
              for(let i=0;i<45;i++){const now=await frame();frames.push(now-last);last=now;}
              const after=d.profile(false);document.querySelector('#run').click();
              frames.sort((a,b)=>a-b);const steps=after.steps-before.steps;
              const result={n:d.round().count,frames:frames.length,steps,buildMs:after.buildMs,medianMs:frames[22],p95Ms:frames[42],
                jsHeapMiB:performance.memory?.usedJSHeapSize/1048576};
              for(const k of ['ai','physics','contacts','renderSync'])result[k+'MsPerStep']=(after[k]-before[k])/steps;
              return result;
            }""")
            print(json.dumps(data),flush=True);await ctx.close()
        await browser.close()

if __name__=='__main__':asyncio.run(bench())
