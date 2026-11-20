"""Lightweight CPU regression using the game's real RPS AI and mock p2/pixi.
Not a full real-WebGL physics benchmark."""
import os
import asyncio
from playwright.async_api import async_playwright
from input_smoke import launch_page

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path=os.environ.get('SWARM_CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox','--disable-gpu'])
        for mode,count in [('3',160),('5',120)]:
            ctx,page,errors=await launch_page(browser)
            await page.locator('#mode').select_option(mode)
            await page.locator('#population').fill(str(count))
            await page.locator('#reset').click()
            await page.locator('#startBig').click()
            result=await page.evaluate('''() => {
               const start=performance.now();
               for(let i=0;i<24;i++) __app.ticker.fns[0]({deltaMS:50});
               return {elapsedMs:performance.now()-start,units:__swarmInputDebug.units().length,
                       pct:[...document.querySelectorAll('.overview-item b')].map(el=>el.textContent)};
            }''')
            assert len(result['pct'])==int(mode),result
            assert all(x.endswith('%') and '.' in x for x in result['pct']),result
            assert result['units']==int(mode)*count,result
            assert not errors,errors
            print('PASS',mode,'species:',result['units'],'actors, 24 simulated render frames,',round(result['elapsedMs']),'ms (mocked render/physics)')
            await ctx.close()
        await browser.close()
if __name__=='__main__': asyncio.run(main())
