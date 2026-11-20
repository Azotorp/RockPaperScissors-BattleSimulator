"""Run against the static /dev/ entry point with the production Pixi and p2 scripts."""
import asyncio
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tests'))
from visual_phase1 import routes, ORIGIN


async def main():
    async with async_playwright() as playwright:
        for width, height in [(1200, 760), (390, 844)]:
            browser = await playwright.chromium.launch(
                executable_path=os.getenv('SWARM_CHROMIUM', '/usr/bin/chromium'),
                args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
                      '--enable-unsafe-swiftshader', '--disable-unsafe-webgpu'])
            ctx = await browser.new_context(viewport={'width': width, 'height': height},
                                            has_touch=(width < 500))
            await routes(ctx)
            await ctx.route(ORIGIN + 'dev/', lambda r: r.fulfill(path=str(ROOT / 'dev/index.html')))
            await ctx.add_init_script("""window.__forceSwarmDebug=true;
                localStorage.setItem('swarmArena.preferences', 'stable sentinel');""")
            page = await ctx.new_page()
            issues = []
            page.on('pageerror', lambda e: issues.append(str(e)))
            page.on('response', lambda r: issues.append(r.url) if r.status >= 400 else None)
            await page.goto(ORIGIN + 'dev/')
            await page.wait_for_function("window.__swarmInputDebug || debugMsg.textContent")
            assert await page.evaluate("!!window.__swarmInputDebug"), await page.locator('#debugMsg').text_content()
            await page.evaluate("""() => {
              window.d = __swarmInputDebug;
              window.s = SwarmSettings;
              window.opt = (k,v) => s.setSetting('modes.3.' + k, v);
              window.check = (v, msg) => { if (!v) throw Error(msg); };
              s.setSetting('hud.statsPanel','open');
              opt('wallWidth',40);
              const a = d.round().arena, o = d.round().outer, r = d.round().radius;
              check(a.left === o.left + 40 && a.bottom === o.bottom - 40, 'wall inset');
              opt('boundaryMode','wrap');
              const map = metricMap.getContext('2d');
              const sample = (x,y) => Array.from(map.getImageData(x,y,1,1).data).join(',');
              const pictures = new Set();
              s.setSetting('grid.visible',false);
              const draw = style => SwarmVisuals.drawMap({bounds:SwarmBoundary.rectangle(80,70,240,230),
                x:0,y:0,width:320,height:300,zoom:1,metersPerWorldUnit:.024,
                wallPx:20,style,boundary:'wrap'});
              for (const style of Array.from(borderStyle.options, o=>o.value)) {
                opt('borderStyle',style);
                draw(style);
                pictures.add(metricMap.toDataURL());
                check(sample(82,150)===sample(160,150),'style spilled inside '+style);
                if(style==='solid') {
                  check(sample(79,150)==='255,148,31,255', 'left portal palette');
                  check(sample(160,69)==='41,158,255,255', 'top portal palette');
                }
                check(JSON.stringify(d.round().arena)===JSON.stringify(a), 'style changed geometry');
              }
              check(pictures.size===9,'nine distinct border styles');
              s.setSetting('grid.visible',true);
              d.scenario([['rock',a.right-r-1,300],['scissors',a.left+80,300]]);
              d.setPairVelocity(480,0);d.stepSimulation(1);
              check(Math.abs(d.units()[0].x-a.left-r-7)<0.01,'overshoot at orange portal');
              opt('boundaryMode','walls');
              opt('ai.rock.enabled',false);
              d.scenario([['rock',a.right-r-1,300],['paper',a.left+80,300]]);
              d.setPairVelocity(1e6,0);d.stepSimulation(1);
              check(Math.abs(d.units()[0].x-a.right+r)<0.01 && d.units()[0].vx===0,'fast wall collision');
              d.scenario(Array.from({length:32},(_,i)=>['rock',a.right-r-(i%4),200+Math.floor(i/4)]));
              d.stepSimulation(90);
              check(d.units().every(u=>u.x<=a.right-r+1e-6 && u.x>=a.left+r-1e-6),'crowded wall');
              opt('boundaryMode','none');
              d.move(0,-4000,4000);d.stepSimulation(1);
              check(d.units()[0].x===-4000 && wallControl.hidden && styleControl.hidden,'unbounded behavior');
              opt('boundaryMode','wrap');
              d.scenario([['rock',100,150],['paper',innerWidth-50,300]]);
              const before=d.units();
              opt('camera',{x:0,y:0,zoom:1.5});
              const cam=d.camera(), time=d.time();
              check(d.round().outer.width===innerWidth,'zoom resized arena');
              resizeArena.click();
              check(Math.abs(d.round().outer.width-innerWidth/1.5)<1e-6,'view capture');
              check(d.units()[0].x===before[0].x && d.units()[0].y===before[0].y,'insider moved');
              check(d.units()[1].x!==before[1].x && d.units()[1].vx===before[1].vx,'outsider or velocity');
              check(d.time()===time && d.round().state==='paused' && d.zoom()===1.5 &&
                JSON.stringify(d.camera())===JSON.stringify(cam),'resize disturbed round or camera');
              opt('boundaryMode','none');d.move(0,-4000,4000);resizeArena.click();
              check(d.units()[0].x===-4000,'unbounded resize moved creature');
              opt('camera',{x:0,y:0,zoom:1});
              opt('boundaryMode','wrap');
              opt('borderStyle','outset');
              check(!wallControl.hidden && wallWidth.getBoundingClientRect().width>112,'responsive control');
              document.querySelector('#reset').click();
            }""")
            await page.evaluate("""async () => {
              await s.flush();
              const stored = JSON.parse(localStorage.getItem(s.key)).preferences;
              check(stored['modes.3.wallWidth']===40, 'persisted width');
              check(localStorage.getItem('swarmArena.preferences')==='stable sentinel','stable storage');
            }""")
            if folder := os.getenv('SWARM_SCREENSHOTS'):
                Path(folder).mkdir(parents=True, exist_ok=True)
                await page.screenshot(path=str(Path(folder) / f'boundary-{width}.png'))
            assert not issues, issues
            await browser.close()
        print('PASS desktop and mobile viewport, live p2, wall pressure, portal, styles, settings and relative assets')


if __name__ == '__main__':
    asyncio.run(main())
