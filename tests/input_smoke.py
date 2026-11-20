"""Chromium DOM-input checks with lightweight Pixi/p2 test doubles.

These validate event routing and coordinate math; real Pixi/p2 rendering is not
mocked as functional gameplay. Run: python tests/input_smoke.py
"""
import os
import asyncio
import re
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]

async def launch_page(browser, mobile=False):
    viewport = {'width': 390, 'height': 844} if mobile else {'width': 1200, 'height': 760}
    ctx = await browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile,
        device_scale_factor=3 if mobile else 1)
    page = await ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    await ctx.add_init_script('window.__forceSwarmDebug = true')
    async def serve(route):
        from urllib.parse import urlparse, unquote
        url=urlparse(route.request.url)
        if url.netloc=='arena.test':
            name=unquote(url.path.lstrip('/')) or 'index.html'
            path=(ROOT/name).resolve()
            if path.is_relative_to(ROOT) and path.is_file():
                return await route.fulfill(path=str(path))
        if 'pixi.min.js' in url.path:
            return await route.fulfill(path=str(ROOT/'tests/pixi-p2-mocks.js'),content_type='application/javascript')
        if 'p2.min.js' in url.path:
            return await route.fulfill(body='',content_type='application/javascript')
        await route.fulfill(status=404)
    await ctx.route('**/*',serve)
    await page.goto('http://arena.test/')
    await page.wait_for_function('!!window.__swarmInputDebug && !!document.querySelector("canvas")')
    assert not errors, errors
    return ctx, page, errors

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=os.environ.get('SWARM_CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox','--disable-gpu'])
        ctx, page, errors = await launch_page(browser)
        await page.evaluate("() => {let m=document.querySelector('#mode');m.value='zombie';m.dispatchEvent(new Event('change'));document.querySelector('#population').value=1;document.querySelector('#reset').click()}")
        await page.locator('[data-close="statsPanel"]').click()
        await page.locator('[data-close="spawnPanel"]').click()
        start_n = await page.evaluate('__swarmInputDebug.units().length')
        # Exact mouse hit at baseline and after zoom + right-button pan.
        await page.mouse.click(900, 450)
        exact = await page.evaluate('''() => ({ placed: __swarmInputDebug.units().at(-1), expected: __swarmInputDebug.pointerWorld(900,450) })''')
        assert exact['placed']['type']=='zombie'
        assert abs(exact['placed']['x']-exact['expected']['x']) < .001
        assert abs(exact['placed']['y']-exact['expected']['y']) < .001
        assert await page.evaluate('__swarmInputDebug.units().length') == start_n + 1
        await page.mouse.move(700, 400)
        await page.mouse.wheel(0,-250)
        await page.mouse.move(800,450)
        await page.mouse.down(button='right')
        await page.mouse.move(840,485,steps=3)
        await page.mouse.up(button='right')
        await page.mouse.click(950, 430)
        exact = await page.evaluate('''() => ({ placed: __swarmInputDebug.units().at(-1), expected: __swarmInputDebug.pointerWorld(950,430) })''')
        assert abs(exact['placed']['x']-exact['expected']['x']) < .001
        assert abs(exact['placed']['y']-exact['expected']['y']) < .001
        # RPS and RPSLS modes must use the same corrected positioning.
        await page.locator('[data-toggle="statsPanel"]').click()
        for mode in ('3','5'):
            await page.locator('#mode').select_option(mode)
            await page.locator('#population').fill('1')
            await page.locator('#reset').click()
            await page.locator('[data-close="statsPanel"]').click()
            await page.locator('[data-toggle="spawnPanel"]').click()
            await page.locator('.spawn-option').first.click()
            await page.locator('[data-close="spawnPanel"]').click()
            await page.mouse.click(950,430)
            result = await page.evaluate('''() => ({ placed: __swarmInputDebug.units().at(-1), expected: __swarmInputDebug.pointerWorld(950,430) })''')
            assert abs(result['placed']['x']-result['expected']['x']) < .001, (mode,result)
            assert abs(result['placed']['y']-result['expected']['y']) < .001, (mode,result)
            await page.locator('[data-toggle="statsPanel"]').click()
        assert not errors, errors
        print('PASS desktop exact mouse placement at default/zoomed/panned camera in all modes')
        await ctx.close()
        ctx,page,errors=await launch_page(browser,True)
        await page.evaluate("() => {let m=document.querySelector('#mode');m.value='zombie';m.dispatchEvent(new Event('change'));document.querySelector('#population').value=1;document.querySelector('#reset').click()}")
        await page.evaluate('''() => {
          function makeTouch(id,x,y) {return new Touch({identifier:id, target:document.querySelector('canvas'), clientX:x,clientY:y,pageX:x,pageY:y,screenX:x,screenY:y,radiusX:5,radiusY:5,force:1});}
          window.emitTouch=(name,all,changed)=>document.querySelector('canvas').dispatchEvent(new TouchEvent(name,{touches:all.map(c=>makeTouch(...c)),targetTouches:all.map(c=>makeTouch(...c)),changedTouches:changed.map(c=>makeTouch(...c)),bubbles:true,cancelable:true}));
        }''')
        before = await page.evaluate('__swarmInputDebug.units().length')
        await page.evaluate("emitTouch('touchstart',[[1,270,460]],[[1,270,460]]);emitTouch('touchend',[],[[1,270,460]])")
        result=await page.evaluate('''() => ({ placed: __swarmInputDebug.units().at(-1), expected: __swarmInputDebug.pointerWorld(270,460) })''')
        assert abs(result['placed']['x']-result['expected']['x']) < .001, result
        assert abs(result['placed']['y']-result['expected']['y']) < .001, result
        assert await page.evaluate('__swarmInputDebug.units().length')==before+1
        # Simulated simultaneous gestures with real TouchEvent dispatch.
        startzoom=await page.evaluate('__swarmInputDebug.zoom()')
        await page.evaluate("emitTouch('touchstart',[[1,120,370]],[[1,120,370]]);emitTouch('touchstart',[[1,120,370],[2,260,370]],[[2,260,370]])")
        await page.evaluate("emitTouch('touchmove',[[1,150,370],[2,230,370]],[[1,150,370],[2,230,370]])")
        zoom_in=await page.evaluate('__swarmInputDebug.zoom()')
        assert abs(zoom_in/startzoom-80/140)<1e-6, (zoom_in,startzoom)
        await page.evaluate("emitTouch('touchmove',[[1,100,375],[2,280,375]],[[1,100,375],[2,280,375]])")
        zoom_out=await page.evaluate('__swarmInputDebug.zoom()')
        assert abs(zoom_out/startzoom-180/140)<1e-6, (zoom_in,zoom_out)
        cam0=await page.evaluate('__swarmInputDebug.camera()')
        await page.evaluate("emitTouch('touchmove',[[1,100,420],[2,280,420]],[[1,100,420],[2,280,420]])")
        cam1=await page.evaluate('__swarmInputDebug.camera()')
        assert abs(cam1['y']-cam0['y']-45)<.01,(cam0,cam1)
        await page.evaluate("emitTouch('touchend',[],[[1,100,420],[2,280,420]])")
        assert await page.evaluate('__swarmInputDebug.units().length')==before+1, 'Two-finger gestures spawned creatures'
        # Touch must map correctly after camera has zoomed and panned.
        await page.evaluate("emitTouch('touchstart',[[3,280,620]],[[3,280,620]]);emitTouch('touchend',[],[[3,280,620]])")
        result=await page.evaluate('''() => ({ placed: __swarmInputDebug.units().at(-1), expected: __swarmInputDebug.pointerWorld(280,620) })''')
        assert abs(result['placed']['x']-result['expected']['x']) < .001, result
        assert abs(result['placed']['y']-result['expected']['y']) < .001, result
        await page.evaluate("""()=>{
          const d=__swarmInputDebug,s=SwarmSettings;
          s.setSetting('modes.zombie.camera',{x:-22,y:17,zoom:3});
          const anchor=d.pointerWorld(150,310);
          emitTouch('touchstart',[[1,100,310],[2,200,310]],[[1,100,310],[2,200,310]]);
          emitTouch('touchmove',[[1,85,330],[2,285,330]],[[1,85,330],[2,285,330]]);
          const after=d.pointerWorld(185,330);
          if(d.zoom()!==6||Math.hypot(anchor.x-after.x,anchor.y-after.y)>1e-8)throw Error('midpoint anchor');
          emitTouch('touchend',[],[[1,85,330],[2,285,330]]);
          emitTouch('touchstart',[[5,100,370],[6,250,370]],[[5,100,370],[6,250,370]]);
          emitTouch('touchmove',[[5,125,370],[6,200,370]],[[5,125,370],[6,200,370]]);
          emitTouch('touchcancel',[],[[5,125,370],[6,200,370]]);
          if(d.zoom()!==3||d.fingerCount()!==0)throw Error('committed zoom/cancel');return s.flush();
        }""")
        await page.reload()
        await page.wait_for_function('window.__swarmInputDebug?.zoom()===3')
        assert not errors, errors
        print('PASS simulated mobile tap, pinching inward/outward, two-finger pan, no ghost spawn, touch after zoom')
        await ctx.close()
        # A Windows touch device may dispatch PointerEvents with pointerType=touch
        # without TouchEvents. The touch pointer fallback must still work.
        ctx,page,errors=await launch_page(browser,False)
        await page.evaluate("() => {let m=document.querySelector('#mode');m.value='zombie';m.dispatchEvent(new Event('change'));document.querySelector('#population').value=1;document.querySelector('#reset').click()}")
        before=await page.evaluate('__swarmInputDebug.units().length')
        await page.evaluate('''() => {
          const canvas=document.querySelector('canvas');
          window.pointerTouch=(name,id,x,y) => canvas.dispatchEvent(new PointerEvent(name,
            {pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y,bubbles:true,cancelable:true,isPrimary:id===1}));
          pointerTouch('pointerdown',1,930,510);pointerTouch('pointerup',1,930,510);
        }''')
        assert await page.evaluate('__swarmInputDebug.units().length')==before+1
        result=await page.evaluate('''() => ({placed:__swarmInputDebug.units().at(-1),expected:__swarmInputDebug.pointerWorld(930,510)})''')
        assert abs(result['placed']['x']-result['expected']['x'])<.001
        assert abs(result['placed']['y']-result['expected']['y'])<.001
        await page.evaluate('''() => {
          pointerTouch('pointerdown',1,150,380);pointerTouch('pointerdown',2,290,380);
          pointerTouch('pointermove',1,180,380);pointerTouch('pointermove',2,260,380);
        }''')
        assert abs(await page.evaluate('__swarmInputDebug.zoom()')-80/140)<1e-6
        await page.evaluate("pointerTouch('pointerup',1,180,380);pointerTouch('pointerup',2,260,380)")
        assert await page.evaluate('__swarmInputDebug.units().length')==before+1
        assert not errors, errors
        print('PASS touchscreen PointerEvent fallback without native TouchEvents')
        await ctx.close()
        await browser.close()

if __name__=='__main__': asyncio.run(main())
