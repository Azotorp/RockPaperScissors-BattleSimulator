"""Exercise the live dev arena, WebGPU switch, visibility, preferences and HUD."""
import asyncio
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tests'))
from visual_phase1 import routes, ORIGIN


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=os.getenv('SWARM_CHROMIUM','/usr/bin/chromium'),
            args=['--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader',
                  '--disable-vulkan-surface','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await browser.new_context(viewport={'width':1200,'height':760})
        await routes(ctx)
        await ctx.add_init_script('window.__forceSwarmDebug=true')
        p = await ctx.new_page()
        errors=[]
        p.on('pageerror',lambda e:errors.append(str(e)))
        await p.goto(ORIGIN+'dev/index.html')
        await p.wait_for_function('window.__swarmInputDebug')
        await p.evaluate("""()=>{
          window.d=__swarmInputDebug; window.s=SwarmSettings;
          const request=GPUAdapter.prototype.requestDevice;
          GPUAdapter.prototype.requestDevice=async function(...args){
            const dev=await request.apply(this,args);window.arenaDevice=dev;return dev;
          };
          s.setSetting('game.mode','zombie');
          window.opt=(k,v)=>s.setSetting(s.modePath('zombie',k),v);
          window.check=(v,msg)=>{if(!v)throw Error(msg);};
          opt('population',9999);opt('movementBackend','gpu');opt('seedMode','fixed');opt('seed','toggle');
          reset.click();
        }""")
        await p.wait_for_function("d.round().count===9999 && !d.round().preparing && (d.round().gpuSteps>=3 || movementStatus.textContent.includes('unavailable'))",timeout=90000)
        print(await p.evaluate("""async()=>{
          check(d.round().gpuSteps>=3,movementStatus.textContent);
          const start=performance.now(),t0=d.time(),steps=d.round().gpuSteps;
          await new Promise(r=>setTimeout(r,2000));
          return {status:movementStatus.textContent,agents:d.round().count,steps:d.round().gpuSteps-steps,
            actual:(d.time()-t0)*1000/(performance.now()-start)};
        }"""),flush=True)
        await p.evaluate("""()=>{window.seed=d.round().roundSeed;opt('movementBackend','cpu');}""")
        await p.wait_for_function("movementStatus.textContent==='CPU movement'")
        await p.evaluate("""()=>{check(d.round().roundSeed===seed,'round restarted');window.prev=d.round().gpuSteps;opt('movementBackend','gpu');}""")
        await p.wait_for_function("d.round().gpuSteps>prev")
        await p.evaluate('()=>{window.moved=d.round().gpuAgents;d.infectFirstHuman();}')
        await p.wait_for_function("d.round().gpuAgents>moved && movementStatus.textContent.includes('GPU steering')")
        await p.evaluate("()=>{window.afterLoss=d.time();arenaDevice.destroy();}")
        await p.wait_for_function("movementStatus.textContent.startsWith('CPU movement') && d.time()>afterLoss")
        await p.evaluate("""()=>{
          check(d.round().count===9999,'handoff lost agents');
          run.click();opt('movementBackend','cpu');opt('population',6);
          opt('camera',{x:40,y:-20,zoom:1.5});reset.click();
        }""")
        await p.wait_for_function("!d.round().preparing && d.round().count===6")
        await p.evaluate("""()=>{
          resizeArena.click();window.savedBounds=JSON.stringify(d.round().outer);
          opt('wallWidth',11);opt('borderStyle','outset');opt('boundaryMode','wrap');
          opt('population',12);reset.click();
          check(d.round().count===12 && JSON.stringify(d.round().outer)===savedBounds,'remember geometry');
          check(d.round().arena.left===d.round().outer.left+11,'remember width');
          check(population.max==='999999' && speed.max==='100','limits');
          check(s.schema.get('modes.zombie.speed').valid(100),'speed import');
          check(stateItems.textContent.includes('Infected human'),'state names');
          check(statsOpacity.value==='100' && s.getSetting('hud.backgroundTransparency')===0,'opaque defaults');
        }""")
        # Download and import via the same controls used on a deployed site.
        await p.locator('#settingsOpen').click()
        await p.get_by_role('button',name='Interface',exact=True).click()
        await p.get_by_role('button',name='Move overlays',exact=True).click()
        box=await p.locator('#statsPanel h1').bounding_box()
        x,y=box['x']+20,box['y']+8
        await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+140,y+30,steps=4);await p.mouse.up()
        await p.get_by_role('button',name='Done moving').click()
        assert await p.evaluate("s.getSetting('hud.layout.statsPanel')!==null")
        await p.locator('#settingsOpen').click()
        await p.get_by_role('button',name='Data & Storage').click()
        async with p.expect_download() as event:
            await p.get_by_role('button',name='Export settings').click()
        download=await event.value
        assert download.suggested_filename=='default.config.json'
        raw=(await download.path()).read_bytes()
        settings=json.loads(raw)['preferences']
        assert len(settings)>200 and settings['modes.zombie.arenaBounds'] and settings['hud.layout.statsPanel']
        await p.get_by_role('button',name='Interface',exact=True).click()
        await p.get_by_role('button',name='Reset overlay positions').click()
        assert await p.evaluate("s.getSetting('hud.layout.statsPanel')===null")
        await p.get_by_role('button',name='Data & Storage').click()
        await p.locator('input[type=file]').set_input_files({'name':'default.config.json','mimeType':'application/json','buffer':raw})
        await p.wait_for_function("s.getSetting('hud.layout.statsPanel')!==null")
        await p.reload()
        await p.wait_for_function("window.__swarmInputDebug && __swarmInputDebug.round().count===12")
        await p.evaluate("""()=>{
          const s=SwarmSettings,d=__swarmInputDebug,opt=(k,v)=>s.setSetting('modes.zombie.'+k,v);
          const check=(v,msg)=>{if(!v)throw Error(msg);};
          check(boundaryMode.value==='wrap' && wallWidth.value==='11' && borderStyle.value==='outset','reload wall settings');
          const [l,top,r,b,x,y]=s.getSetting('modes.zombie.arenaBounds'),o=d.round().outer;
          check(o.left===l+x && o.top===top+y && o.right===r+x && o.bottom===b+y,'reload wall geometry');
          opt('boundaryMode','none');opt('aiInterval',1);opt('threshold',1);opt('idleMin',0);opt('idleMax',0);
          opt('huntTime',100);opt('ai.zombie.fov',true);opt('ai.zombie.sight',0);opt('ai.zombie.hearing',0);
          for(const solver of ['cpu','p2']){
            opt('solver',solver);reset.click();
            for(const enabled of [false,true]){
              opt('offscreenPhysics',enabled);opt('ai.human.enabled',false);
              d.scenario([['human',10000,10000],['human',10002,10000]]);d.stepSimulation(2);
              const [a,b]=d.units();check((Math.abs(a.x-b.x)>3)===enabled,solver+' offscreen collisions '+enabled);
            }
            opt('offscreenPhysics',false);opt('ai.human.enabled',true);
            d.scenario([['human',10000,10000]]);d.stepSimulation(2);check(d.units()[0].x>10000,'offscreen movement');
            d.scenario([['zombie',10000,10000],['human',250,250]]);d.stepSimulation(28);
            check(d.units()[0].ai==='Zh','zombie returned to idle');
            d.scenario([['zombie',300,300],['human',301,300]]);d.stepSimulation(2);
            check(d.units()[1].ai==='Hi','bite');d.stepSimulation(1);
          }
        }""")
        await p.wait_for_function("__swarmInputDebug.appearance(1).tint===0xffe347")
        assert await p.evaluate("__swarmInputDebug.appearance(1).marker===0xffe347")
        await p.evaluate("""()=>{
          const d=__swarmInputDebug,s=SwarmSettings,opt=(k,v)=>s.setSetting('modes.zombie.'+k,v);
          const check=(v,msg)=>{if(!v)throw Error(msg);};
          opt('solver','cpu');reset.click();opt('boundaryMode','none');opt('aiInterval',1);
          opt('ai.human.enabled',false);opt('ai.zombie.enabled',true);opt('ai.zombie.fov',true);
          opt('idleMin',10000);opt('idleMax',10000);opt('ai.zombie.hearing',0);opt('ai.zombie.sight',3);
          // #0 detects a human. #1 can see only the newly active #0.
          d.scenario([['zombie',300,200],['zombie',250,200],['human',334,200]]);
          d.stepSimulation(1);let u=d.units();
          check(u[0].ai==='Zc' && u[1].ai==='Zh','pack wake '+u.map(v=>v.ai));
          d.move(2,1500,1500);d.stepSimulation(30);
          check(d.units().slice(0,2).every(z=>z.ai==='Zh'),'reverted to idle');
          opt('ai.zombie.sight',0);opt('ai.zombie.hearing',3);
          d.scenario([['zombie',300,200],['human',250,200]]);
          d.stepSimulation(1);check(d.units()[0].ai==='Zc','hearing wake');
          opt('ai.zombie.fov',false);opt('threshold',1);opt('incubation',500);
          opt('bonusInterval',30);opt('bonus',100);opt('offscreenPhysics',true);
          d.scenario([['zombie',300,300],['human',301,300],['human',650,300]]);
          d.stepSimulation(2);const remaining=d.units()[1].incubation;
          d.stepSimulation(3);u=d.units();
          check(u[0].target===u[1].id && u[1].incubation<remaining-80,'lost infected target or bite bonus');
          for(let i=0;i<35 && d.units()[1].type==='human';i++)d.stepSimulation(1);
          u=d.units();check(u[1].type==='zombie' && u[1].ai==='Zi','conversion must start idle');
          d.stepSimulation(1);u=d.units();
          check(u[0].target===u[2].id && u[1].target===u[2].id && u[1].ai==='Zc','retarget after conversion');
          opt('brush','human');opt('massSpawn',true);opt('spawnBurst',8);opt('spawnRate',0);
          window.beforeSpawn=d.round().count;
        }""")
        point=await p.evaluate("""()=>{
          const canvas=document.querySelector('#game canvas');
          for(let y=40;y<innerHeight-30;y+=30)for(let x=40;x<innerWidth-30;x+=30)
            if(document.elementFromPoint(x,y)===canvas)return [x,y];
          throw Error('No visible canvas point');
        }""")
        await p.mouse.click(*point)
        await p.evaluate("""()=>{
          const check=(v,msg)=>{if(!v)throw Error(msg);};
          check(__swarmInputDebug.round().count===beforeSpawn+8,'mass spawn '+JSON.stringify([beforeSpawn,__swarmInputDebug.round().count,massSpawn.checked,spawnBurst.value,document.querySelector('.spawn-option.active')?.dataset.kind,roundNotice.textContent,__swarmInputDebug.lastPlaced()]));
          for(const id of ['spawnRate','spawnBurst','spawnSpread','massSpawn'])
            check(document.getElementById(id).closest('#spawnPanel'),'spawn brush control '+id);
        }""")
        # Use an exported file as the site's initial defaults in a clean browser profile.
        ctx2=await browser.new_context();await routes(ctx2)
        await ctx2.route('**/default.config.json',lambda route:route.fulfill(body=raw,content_type='application/json'))
        await ctx2.add_init_script("window.__forceSwarmDebug=true;Object.defineProperty(navigator,'gpu',{value:undefined})")
        q=await ctx2.new_page();await q.goto(ORIGIN+'dev/index.html')
        await q.wait_for_function("window.__swarmInputDebug && population.value==='12'")
        await q.evaluate("""()=>SwarmSettings.setSetting('modes.zombie.movementBackend','gpu')""")
        await q.wait_for_function("movementStatus.textContent.includes('unavailable')")
        assert await q.evaluate("SwarmSettings.getSetting('hud.layout.statsPanel')!==null")
        assert not errors, errors
        await browser.close()
        print('PASS GPU handoff, saved bounds, both offscreen solvers, infection tint, zombie search, HUD drag/reset, JSON round trip and site defaults',flush=True)

if __name__=='__main__': asyncio.run(main())
