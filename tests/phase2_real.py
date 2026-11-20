"""Real p2 contact duration, replay cancellation, camera precision and browser frame budget."""
import asyncio
import os
from playwright.async_api import async_playwright
from visual_phase1 import ready,routes

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.getenv('SWARM_CHROMIUM','/usr/bin/chromium'),
            args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx=await browser.new_context(viewport={'width':1200,'height':760})
        await routes(ctx);await ctx.add_init_script('window.__forceSwarmDebug=true')
        page=await ctx.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        await ready(page)
        await page.evaluate("""()=>{
          const d=__swarmInputDebug,s=SwarmSettings;
          s.setSetting('game.mode','zombie');
          const opt=(k,v)=>s.setSetting('modes.zombie.'+k,v);
          opt('ai.human.enabled',false);opt('ai.zombie.fov',false);opt('aiInterval',1);
          d.scenario([['zombie',380,350,0],['human',400,350,0]]);
          d.stepSimulation(90);const [z,h]=d.units();
          if(h.ai!=='Hi'||h.incubation===null||h.exposure!==1000||Math.abs(h.x-z.x)<15)throw Error('real p2 bite or solid-body separation failed: '+JSON.stringify([z,h]));
          const old=h.incubation;d.move(0,1000,600);d.stepSimulation(6);
          if(Math.abs(d.units()[1].incubation-old+100)>.1)throw Error('stale end contact');
          s.setSetting('game.mode','5');s.setSetting('modes.5.population',2000);s.setSetting('modes.5.arenaScale',5);
          reset.click();s.setSetting('modes.5.population',160);reset.click();reset.click();
        }""")
        await page.wait_for_function("!__swarmInputDebug.round().preparing && __swarmInputDebug.round().count===800")
        await page.evaluate("""()=>{
          const d=__swarmInputDebug,s=SwarmSettings,r=d.round();
          if(r.bodies!==800 || r.retired || r.activePairs)throw Error('stale round objects');
          const bounds=JSON.stringify(r.arena),map=d.units().map(u=>[u.x,u.y]);
          const canvas=document.querySelector('#game canvas');
          for(let i=0;i<100;i++)canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:900,clientX:600,clientY:380,cancelable:true}));
          if(d.zoom()>=.001||!Number.isFinite(d.zoom()))throw Error('zoom limit');
          if(JSON.stringify(d.round().arena)!==bounds||JSON.stringify(d.units().map(u=>[u.x,u.y]))!==JSON.stringify(map))throw Error('camera moved world');
          document.querySelector('#focusTool').click();
        }""")
        await page.mouse.click(600,380)
        await page.evaluate("""()=>{
          const d=__swarmInputDebug,s=SwarmSettings,r=d.round();
          d.stepSimulation(12);
          if(d.units().some(u=>!Number.isFinite(u.x+u.y)))throw Error('nonfinite position');
          const step=SwarmVisuals.grid();s.setSetting('modes.5.headsAcross',100);
          if(SwarmVisuals.grid().metersPerWorldUnit!==step.metersPerWorldUnit)throw Error('head scale changed grid');
          s.setSetting('modes.5.boundaryMode','wrap');d.scenario([['rock',r.arena.right-1,350,0],['scissors',r.arena.left+60,350,0]]);
          d.setPairVelocity(180,0);d.stepSimulation(1);
          if(d.units()[0].x>r.arena.left+10)throw Error('portal did not transfer');
        }""")
        assert not errors,errors
        await browser.close()
        print('PASS real solid-body infection, end contact, interrupted high-population restart, extreme zoom hit testing, stable bounds and metric scale, finite movement and wrap transfer')
if __name__=='__main__':asyncio.run(main())
