"""Mock-based contact conversion and camera regression checks. Not a substitute for
real PixiJS/p2 WebGL integration tests. Run: python tests/physics_zoom_smoke.py"""
import os
import asyncio
from playwright.async_api import async_playwright
from input_smoke import launch_page

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=os.environ.get('SWARM_CHROMIUM','/usr/bin/chromium'),
                                          args=['--no-sandbox', '--disable-gpu'])
        ctx,page,errors = await launch_page(browser)
        assert await page.locator('#mode').input_value() == '3'
        assert await page.locator('#boundaryMode').input_value() == 'walls'
        assert 'crushes' in await page.locator('#diagram').inner_text()
        await page.evaluate("__swarmInputDebug.placePair('rock','scissors',300,300,10)")
        masks = await page.evaluate('__swarmInputDebug.contactFilters()')
        assert all(c['mask'] & c['group'] for c in masks), masks
        await page.evaluate('__swarmInputDebug.stepSimulation(1)')
        assert await page.evaluate('__swarmInputDebug.units().map(u=>u.type)') == ['rock','rock']
        await page.evaluate("__swarmInputDebug.placePair('rock','scissors',300,300,100)")
        await page.evaluate('__swarmInputDebug.stepSimulation(1)')
        await page.evaluate('__swarmInputDebug.setPairVelocity(6000,-6000)')
        await page.evaluate('__swarmInputDebug.stepSimulation(1)')
        assert await page.evaluate('__swarmInputDebug.units().map(u=>u.type)') == ['rock','rock']
        await page.evaluate("""() => {
          for(let i=0;i<15;i++)
            document.querySelector('canvas').dispatchEvent(new WheelEvent('wheel',
              {deltaY:-650,clientX:870,clientY:430,cancelable:true}));
        }""")
        z = await page.evaluate('__swarmInputDebug.zoom()')
        assert z > 6, z
        await page.locator('#reset').click()
        assert abs(await page.evaluate('__swarmInputDebug.zoom()')-z) < 1e-8
        await page.evaluate("""() => {
          for(let i=0;i<25;i++)
            document.querySelector('canvas').dispatchEvent(new WheelEvent('wheel',
              {deltaY:1100,clientX:870,clientY:430,cancelable:true}));
          __app.ticker.fns[0]({deltaMS:16});
        }""")
        assert await page.evaluate('__swarmInputDebug.zoom()') < .12
        await page.locator('#mode').select_option('5')
        text = await page.locator('#diagram').inner_text()
        assert all(word in text for word in ('poisons','vaporizes','disproves','decapitates','smashes'))
        await page.evaluate("__swarmInputDebug.placePair('spock','scissors',300,300,10)")
        await page.evaluate('__swarmInputDebug.stepSimulation(1)')
        assert await page.evaluate('__swarmInputDebug.units().map(u=>u.type)') == ['spock','spock']
        assert not errors,errors
        print('PASS contacts, swept conversions, RPSLS, extreme zoom and replay zoom')
        await ctx.close()
        await browser.close()

if __name__=='__main__':
    asyncio.run(main())
