"""Real Chromium, PixiJS and p2 checks. Optionally cache pinned CDN scripts locally.
SWARM_CHROMIUM selects a browser. SWARM_CDN_CACHE may contain pixi.min.js/p2.min.js.
SWARM_SCREENSHOTS optionally saves preview PNGs to the named directory.
"""
import asyncio
import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'http://localhost:4187/'
KEY = 'swarmArena.preferences'


async def routes(ctx):
    async def serve(route):
        url = urlparse(route.request.url)
        if url.netloc == 'localhost:4187':
            path = (ROOT / (unquote(url.path.lstrip('/')) or 'index.html')).resolve()
            if path.is_relative_to(ROOT) and path.is_file():
                return await route.fulfill(path=str(path))
            return await route.fulfill(status=404)
        cache = os.getenv('SWARM_CDN_CACHE')
        if cache and Path(url.path).name in ['pixi.min.js', 'p2.min.js']:
            return await route.fulfill(path=str(Path(cache)/Path(url.path).name),content_type='application/javascript')
        await route.continue_()
    await ctx.route('**/*', serve)


async def ready(page):
    await page.goto(ORIGIN)
    await page.wait_for_function("!!window.SwarmVisuals || document.querySelector('#debugMsg').style.display==='block'")
    assert await page.evaluate('!!window.SwarmVisuals'), await page.locator('#debugMsg').text_content()


async def shot(page,name):
    if folder := os.getenv('SWARM_SCREENSHOTS'):
        Path(folder).mkdir(exist_ok=True,parents=True)
        await page.screenshot(path=str(Path(folder)/(name+'.png')))


async def run():
    exe=os.getenv('SWARM_CHROMIUM','/usr/bin/chromium')
    errors=[]
    with tempfile.TemporaryDirectory() as profile:
      async with async_playwright() as p:
        async def open_profile():
            ctx=await p.chromium.launch_persistent_context(profile,executable_path=exe,viewport={'width':1200,'height':760},
                args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            await routes(ctx)
            page=ctx.pages[0]
            page.on('pageerror',lambda err:errors.append(str(err)))
            await ready(page)
            return ctx,page
        ctx,page=await open_profile()
        assert await page.evaluate("Object.keys(SwarmRegistry)")==['classic']
        assert await page.locator('#diagram [data-node]').count()==3
        assert await page.locator('#diagram path[marker-end]').count()==3
        await page.locator('[data-close=statsPanel]').click()
        await page.locator('[data-close=spawnPanel]').click()
        await page.locator('#prestartPicks [data-kind=rock]').click()
        assert await page.locator('.overview-item.selected').get_attribute('data-kind')=='rock'
        assert await page.locator('#overview-number-rock').inner_text()=='30'
        assert await page.locator('#overview-count-rock').inner_text()=='33.3%'
        await shot(page,'classic-arena')
        await page.locator('#settingsOpen').click()
        await page.get_by_role('button',name='State preview',exact=True).click()
        await page.wait_for_function("Array.from(document.querySelectorAll('.preview-grid img')).every(i=>i.complete && i.naturalWidth>0)")
        await shot(page,'state-preview')
        await page.locator('#settingsClose').click()
        for mode,wall in [('5',12),('zombie',7),('3',38)]:
            await page.evaluate("([m,w])=>{mode.value=m;mode.dispatchEvent(new Event('change'));wallWidth.value=w;wallWidth.dispatchEvent(new Event('change'))}",[mode,wall])
            if mode=='5':
                assert await page.locator('#diagram path[marker-end]').count()==10
                assert await page.locator('#diagram [data-node]').count()==5
                await shot(page,'five-type-arena')
        await page.evaluate("""async()=>{for(const [k,v] of Object.entries({
        'grid.referenceMeters':0.5,'grid.axis':'#1188aa','hud.population.auto':true,'hud.population.enter':0,
        'hud.bar.transparency':100,'hud.text.transparency':0,'hud.toolbar.transparency':100,'hud.states.visible':false,
        'modes.3.diagramOpacity':22,'modes.3.camera':{x:20,y:60,zoom:0.45}}))SwarmSettings.setSetting(k,v);await SwarmSettings.flush()}""")
        data=await page.evaluate("JSON.parse(SwarmSettings.exportSettings()).preferences")
        await ctx.close()
        ctx,page=await open_profile()
        assert await page.evaluate("JSON.parse(SwarmSettings.exportSettings()).preferences")==data
        assert await page.locator('#wallWidth').input_value()=='38'
        assert await page.locator('#zoomLabel').inner_text()=='45%'
        assert await page.locator('#overviewBars').evaluate("e=>getComputedStyle(e).opacity")=='0'
        assert await page.locator('#prestartPicks [aria-pressed=true]').get_attribute('data-kind')=='rock'
        for mode,expected in [('5','12'),('zombie','7'),('3','38')]:
            await page.evaluate("m=>{mode.value=m;mode.dispatchEvent(new Event('change'))}",mode)
            assert await page.locator('#wallWidth').input_value()==expected
        await page.set_viewport_size({'width':390,'height':844})
        await page.locator('#settingsOpen').click()
        await page.get_by_role('button',name='Data & Storage').click()
        assert await page.get_by_text('Browser storage available',exact=False).is_visible()
        await page.locator('#settingsClose').click()
        other=await ctx.new_page()
        await ready(other)
        await asyncio.gather(page.evaluate("async()=>{SwarmSettings.setSetting('hud.text.transparency',64);await SwarmSettings.flush()}"),
                             other.evaluate("async()=>{SwarmSettings.setSetting('grid.labels',false);await SwarmSettings.flush()}"))
        await page.wait_for_function("SwarmSettings.getSetting('grid.labels')===false")
        await other.wait_for_function("SwarmSettings.getSetting('hud.text.transparency')===64")
        await other.close()
        await page.evaluate("""()=>{localStorage.setItem('another-app','keep');const s=SwarmSettings;
          const backup=s.exportSettings();s.resetSetting('hud');if(s.getSetting('hud.text.transparency')!==0)throw Error('reset HUD');
          s.importSettings(backup); if(s.getSetting('hud.text.transparency')!==64)throw Error('import');
          for(const bad of ['{','{"schemaVersion":99,"preferences":{}}','{"schemaVersion":2,"preferences":{"hud.text.transparency":200}}']){
            let rejected=false;try{s.importSettings(bad)}catch{rejected=true}if(!rejected)throw Error('bad import');
          }
          s.resetSetting();s.clearAll();if(localStorage.getItem(s.key)!==null||localStorage.getItem('another-app')!=='keep')throw Error('clear');
        }""")
        for raw in ['{',json.dumps({'schemaVersion':99,'preferences':{}})]:
            await page.evaluate("v=>localStorage.setItem(SwarmSettings.key,v)",raw)
            await ready(page)
            assert await page.locator('#storageWarning').is_visible()
            await page.evaluate("async()=>{SwarmSettings.setSetting('grid.labels',false);await SwarmSettings.flush()}")
            assert await page.evaluate("localStorage.getItem(SwarmSettings.key)")==raw
        await page.evaluate("localStorage.setItem(SwarmSettings.key,JSON.stringify({schemaVersion:1,preferences:{theme:'classic','hud.bar.transparency':36}}))")
        await ready(page)
        assert await page.evaluate("SwarmSettings.getSetting('hud.bar.transparency')")==36
        await page.evaluate("async()=>{Storage.prototype.setItem=()=>{throw Error('quota')};SwarmSettings.setSetting('hud.bar.transparency',17);await SwarmSettings.flush()}")
        assert await page.locator('#storageWarning').is_visible()
        assert await page.evaluate("SwarmSettings.getSetting('hud.bar.transparency')")==17
        await ctx.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw Error('denied')}})")
        await ready(page)
        assert await page.locator('#storageWarning').is_visible()
        assert not errors,errors
        await ctx.close()
    print('PASS real Pixi/p2 launch, artwork, 3/5 directed diagrams, HUD, settings after browser restart, per-mode restoration, mobile management, multi-tab merge, reset, import, migration, corruption, future version, quota and denied storage')


if __name__=='__main__':
    asyncio.run(run())
