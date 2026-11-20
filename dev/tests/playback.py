"""Measure live speed changes in a seeded 9,999-human round on the main dev page."""
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
            args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx=await browser.new_context(viewport={'width':1200,'height':760})
        await routes(ctx)
        await ctx.add_init_script('window.__forceSwarmDebug=true')
        pg=await ctx.new_page()
        await pg.goto(ORIGIN+'dev/index.html')
        await pg.wait_for_function('!!window.__swarmInputDebug')
        await pg.evaluate("""()=>{
          const s=SwarmSettings;
          s.setSetting('game.mode','zombie');
          for(const [k,v] of Object.entries({population:9999,initialZombies:0,seedMode:'fixed',seed:'speed-test',solver:'cpu'}))
            s.setSetting(s.modePath('zombie',k),v);
          reset.click();
        }""")
        await pg.wait_for_function("__swarmInputDebug.round().count===9999 && __swarmInputDebug.round().state==='running'",timeout=90000)
        rates=[]
        for requested in [1,30,1]:
            result=await pg.evaluate("""async requested=>{
              const speed=document.querySelector('#speed'),d=__swarmInputDebug;
              speed.value=requested;speed.dispatchEvent(new Event('input',{bubbles:true}));
              const sample=async ms=>{const start=performance.now(),sim=d.time();await new Promise(r=>setTimeout(r,ms));
                return (d.time()-sim)*1000/(performance.now()-start);};
              await sample(800);
              const actual=await sample(3000);
              const displayed=document.querySelector('#actualSpeed').textContent;
              return {requested,actual,displayed,count:d.round().count};
            }""", requested)
            print(result,flush=True)
            assert result['count']==9999 and result['displayed'].endswith('× actual'),result
            rates.append(result['actual'])
            if requested==30 and (folder:=os.getenv('SWARM_SCREENSHOTS')):
                target=Path(folder)
                target.mkdir(parents=True,exist_ok=True)
                await pg.locator('#speed').locator('..').screenshot(path=str(target/'playback-speed.png'))
        assert rates[1]>max(rates[0],rates[2])*1.2, rates
        await pg.evaluate('document.querySelector("#run").click()')
        assert await pg.locator('#actualSpeed').text_content()==''
        await pg.evaluate("""()=>{const d=__swarmInputDebug;d.infectFirstHuman();d.stepSimulation(1);
          if(d.units().filter(u=>u.type==='zombie').length!==1)throw Error('Patient zero');}""")
        await browser.close()
if __name__=='__main__':asyncio.run(main())
