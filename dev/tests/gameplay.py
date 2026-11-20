"""Gameplay parity for the selectable CPU and p2 circle solvers."""
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
        print(await pg.evaluate("""()=>{
          const d=__swarmInputDebug, s=SwarmSettings;
          const opt=(k,v)=>s.setSetting(s.modePath(s.getSetting('game.mode'),k),v);
          const rules={rock:['scissors','lizard'],paper:['rock','spock'],scissors:['paper','lizard'],
            lizard:['paper','spock'],spock:['rock','scissors']};
          for(const solver of ['cpu','p2']){
            for(const mode of ['3','5']){
              s.setSetting('game.mode',mode);opt('solver',solver);reset.click();
              if(d.round().solver!==solver)throw Error('solver selection');
              const types=Object.keys(rules).slice(0,Number(mode));
              for(const a of types)for(const b of rules[a].filter(t=>types.includes(t))){
                d.scenario([[a,380,350],[b,393,350]]);
                d.stepSimulation(1);
                if(!d.units().every(u=>u.type===a))throw Error(solver+' '+a+' vs '+b);
              }
            }
            s.setSetting('game.mode','zombie');opt('solver',solver);reset.click();
            opt('ai.human.enabled',false);opt('ai.zombie.fov',false);opt('aiInterval',1);
            d.scenario([['zombie',380,350,0],['human',400,350,0]]);
            d.stepSimulation(90);const [z,h]=d.units();
            if(h.ai!=='Hi'||h.exposure!==1000||Math.abs(h.x-z.x)<15)throw Error(solver+' bite: '+JSON.stringify(h));
            d.move(0,1000,600);d.stepSimulation(6);
            if(Math.abs(d.units()[1].incubation-h.incubation+100)>.1)throw Error(solver+' stale contact');
            d.stepSimulation(600);
            if(d.units()[1].type!=='zombie')throw Error(solver+' incubation');
          }
          for(const mode of ['3','5']){
            s.setSetting('game.mode',mode);opt('solver','cpu');opt('boundaryMode','none');
            opt('aiInterval',1);opt('ai.rock.sight',20);opt('ai.rock.hearing',0);
            for(const fov of [false,true]){
              opt('ai.rock.fov',fov);reset.click();
              d.scenario([['rock',300,300],['paper',380,300],['scissors',460,300]]);
              d.stepSimulation(1);const rock=d.units()[0];
              if(rock.ai!=='flee' || rock.vx>=0)throw Error(mode+' predator between rock and prey, fov '+fov);
            }
          }
          s.setSetting('game.mode','3');opt('ai.rock.fov',false);opt('ai.scissors.enabled',false);
          opt('retargetDelay',350);opt('retarget',10);reset.click();
          d.scenario([['rock',300,300],['scissors',440,300],['scissors',490,300]]);
          d.stepSimulation(1);d.move(2,380,300);d.stepSimulation(6);
          if(d.units()[0].target!==1)throw Error('transient prey stole target');
          d.move(2,490,300);d.stepSimulation(1);d.move(2,380,300);d.stepSimulation(16);
          if(d.units()[0].target!==1)throw Error('switch timer failed to restart');
          d.stepSimulation(10);
          if(d.units()[0].target!==2 || Math.abs(d.units()[0].vy)>1e-6)throw Error('stable straight pursuit');
          s.setSetting('game.mode','3');opt('solver','cpu');opt('seedMode','fixed');opt('seed','replay');
          const replay=()=>{reset.click();d.stepSimulation(45);return JSON.stringify(d.units());};
          if(replay()!==replay())throw Error('CPU seed replay diverged');
          return 'PASS CPU/p2 RPS, RPSLS, Zombie bite, incubation, end contact and seeded CPU replay';
        }"""))
        await browser.close()
if __name__=='__main__':asyncio.run(main())
