"""Exercise Phase 2 through the shipped UI and simulation with controllable physics ticks."""
import asyncio
import os
from playwright.async_api import async_playwright
from input_smoke import launch_page

async def run():
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.getenv('SWARM_CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
        ctx,pg,errors=await launch_page(browser)
        await pg.evaluate("""()=>{
          window.d=__swarmInputDebug;window.s=SwarmSettings;
          window.opt=(k,v)=>s.setSetting(s.modePath(s.getSetting('game.mode'),k),v);
          window.check=(ok,msg)=>{if(!ok)throw Error(msg)};
          opt('boundaryMode','none');opt('aiInterval',1);
          const rules={rock:['scissors','lizard'],paper:['rock','spock'],scissors:['paper','lizard'],lizard:['paper','spock'],spock:['rock','scissors']};
          for(const m of ['3','5']){
            s.setSetting('game.mode',m);opt('boundaryMode','none');opt('aiInterval',1);
            const keys=Object.keys(rules).slice(0,+m);
            for(const hunter of keys)for(const prey of rules[hunter].filter(k=>keys.includes(k))){
              d.scenario([[hunter,800,300,0],[prey,-4000,300,0]]);d.stepSimulation(1);
              check(d.units()[0].ai==='pursue'&&d.units()[0].target===1,hunter+' cannot acquire '+prey);
              opt('ai.'+hunter+'.fov',true);d.stepSimulation(1);check(d.units()[0].ai==='wander','out of FOV');
              d.move(1,845,300);d.stepSimulation(1);check(d.units()[0].ai==='pursue','in FOV');
              opt('ai.'+hunter+'.fov',false);
            }
          }
          d.scenario([['rock',300,300],['scissors',600,300],['paper',330,300]]);d.stepSimulation(1);
          check(d.units()[0].ai==='flee','danger did not preempt pursuit');
          d.move(2,850,300);d.stepSimulation(1);check(d.units()[0].ai==='pursue','failed to return to pursuit');
          s.setSetting('game.mode','zombie');opt('boundaryMode','none');opt('aiInterval',1);
          opt('ai.human.enabled',false);opt('ai.zombie.fov',false);opt('zombieSpeed',5);opt('zombieBoostFactor',1);
          d.scenario([['human',400,400],['zombie',404,400],['zombie',396,400]]);
          d.stepSimulation(30);let h=d.units()[0];check(Math.abs(h.exposure-500)<.01&&h.ai==='H','overlapping bites multiplied');
          check(d.units()[1].ai==='Za','missing attack state');
          d.move(1,1000,300);d.move(2,-1000,300);d.stepSimulation(60);check(Math.abs(d.units()[0].exposure-500)<.01,'contact failed to pause');
          d.move(1,404,400);d.move(2,396,400);d.stepSimulation(30);
          h=d.units()[0];check(h.ai==='Hi' && h.type==='human' && Math.abs(h.incubation-10000)<1,'infection threshold');
          d.stepSimulation(60);h=d.units()[0];check(Math.abs(h.incubation-8000)<1,'extra incubation reduction');
          d.move(1,1000,300);d.move(2,-1000,300);d.stepSimulation(480);
          check(d.units().every(u=>u.type==='zombie'),'failed transform');
          check(document.querySelector('#overview-number-zombie').textContent==='3','stale species HUD');
          check(!document.querySelector('#stateItems').textContent.includes('—'),'missing state counts');
          opt('ai.human.enabled',true);opt('ai.zombie.fov',true);opt('ai.zombie.hearing',0);opt('acquire',200);
          d.scenario([['zombie',350,300,0],['human',1200,300,0]]);d.stepSimulation(1);
          check(d.units()[0].ai==='Zi','idle');d.move(1,420,300);d.stepSimulation(1);check(d.units()[0].ai==='Zh','acquisition');
          d.stepSimulation(14);check(d.units()[0].ai==='Zc','chase');check(d.units()[1].ai==='Hs','fear');
          opt('seedMode','fixed');opt('seed','seed / Ω 01');opt('population',40);opt('initialZombies',3);
          const positions=()=>d.units().map(({type,x,y})=>[type,x,y]);
          reset.click();const first=JSON.stringify(positions());reset.click();check(JSON.stringify(positions())===first,'replay seed mismatch');
          check(d.round().activePairs===0,'stale contact after reset');
          opt('population',15000);reset.click();check(d.round().count===0 && !roundNotice.hidden,'capacity should be reported');
          opt('population',40);reset.click();
        }""")
        # Persist every registered gameplay field at a non-default value where possible.
        await pg.evaluate("""async()=>{
          for(const [path,spec] of s.schema){
            if(!path.startsWith('modes.')||path.endsWith('.camera'))continue;
            const d=spec.d;
            const candidates=typeof d==='boolean'?[!d]:typeof d==='number'?[d+1,d-1,d+.25,d+5,d+100,0,1]:['fixed','grid','wrap','#112233','saved seed','human','rock','zombie'];
            const v=candidates.find(v=>v!==d&&spec.valid(v));if(v!==undefined)s.setSetting(path,v);
          }await s.flush();
        }""")
        expected=await pg.evaluate("JSON.parse(s.exportSettings()).preferences")
        await pg.reload();await pg.wait_for_function('!!window.SwarmVisuals')
        assert await pg.evaluate("JSON.parse(SwarmSettings.exportSettings()).preferences")==expected
        await pg.evaluate("""()=>{localStorage.setItem(SwarmSettings.key,JSON.stringify({schemaVersion:2,preferences:{
          'modes.zombie.fovAngle':75,'modes.zombie.fovRange':9,'modes.zombie.hearingRange':3,'modes.3.rpsSpeed':9999,'modes.5.population':11}}))}""")
        await pg.reload();await pg.wait_for_function('!!window.SwarmVisuals')
        assert await pg.evaluate("""()=>{const s=SwarmSettings;return ['human','zombie'].every(k=>s.getSetting('modes.zombie.ai.'+k+'.angle')===75&&s.getSetting('modes.zombie.ai.'+k+'.sight')===9&&s.getSetting('modes.zombie.ai.'+k+'.hearing')===3)
        && s.getSetting('modes.3.rpsSpeed')===45 && s.getSetting('modes.5.population')===11 && JSON.parse(localStorage.getItem(s.key)).schemaVersion===3}""")
        await pg.locator('#settingsOpen').click()
        await pg.locator('#settingTabs').get_by_text('Spawning',exact=True).click()
        await pg.get_by_role('button',name='Reuse current').click()
        assert await pg.evaluate("SwarmSettings.getSetting('modes.3.seed')===SwarmRound.seed")
        assert not errors,errors
        await browser.close()
        print('PASS rule-directed pursuit, FOV, threat priority, all outbreak states, overlapping and interrupted bites, incubation, live counts, seed/replay, capacity, settings persistence, per-field recovery and schema migration')

if __name__=='__main__':asyncio.run(run())
