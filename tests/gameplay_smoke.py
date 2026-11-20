"""Mock-based regression: exhaustion/recovery, zombie acceleration settings,
no timer option, on-screen percentages, and speed/spawn range.
Requires Playwright and local Chromium. No network or Pixi/p2 CDN required."""
import os
import asyncio, re
from playwright.async_api import async_playwright
from input_smoke import launch_page

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=os.environ.get('SWARM_CHROMIUM','/usr/bin/chromium'), args=['--no-sandbox','--disable-gpu'])
        ctx, page, errors = await launch_page(browser)
        await page.locator('#mode').select_option('zombie')
        await page.locator('#population').fill('1')
        await page.locator('#settingsOpen').click()
        await page.locator('#settingTabs').get_by_text('Spawning',exact=True).click()
        await page.locator('#spawnExtent').fill('1')
        await page.locator('#settingTabs').get_by_text('Human fear',exact=True).click()
        await page.locator('#staminaStart').fill('40')
        await page.locator('#staminaDrain').fill('50')
        await page.locator('#staminaRest').fill('2')
        await page.locator('#settingsClose').click()
        await page.locator('#reset').click()
        assert await page.locator('#unlimitedTime').is_checked()
        assert await page.locator('#survivalTime').is_disabled()
        assert await page.locator('#speed').get_attribute('max')=='30'
        assert await page.locator('#spawnRate').get_attribute('min')=='0'
        assert await page.locator('#spawnBurst').get_attribute('max')=='250'
        assert re.fullmatch(r'\d+\.\d%',await page.locator('#overview-count-human').inner_text())
        assert await page.locator('#overview-count-human').inner_text()=='100.0%'
        assert await page.locator('#overview-count-zombie').inner_text()=='0.0%'
        await page.evaluate('window.__swarmInputDebug.scareFirstHuman()')
        s0=await page.evaluate('window.__swarmInputDebug.units()[0]')
        assert s0['stamina']==40,s0
        # Simulate 1 sec using mocked p2 physics; actor must exhaust and stop.
        await page.evaluate('''() => {for(let i=0;i<22;i++) __app.ticker.fns[0]({deltaMS:50})}''')
        s1=await page.evaluate('window.__swarmInputDebug.units()[0]')
        assert s1['resting'] and s1['stamina']==0,s1
        assert abs(s1['vx'])<.001 and abs(s1['vy'])<.001,s1
        # Remain stationary until rest ends, recover to full and run again.
        await page.evaluate('''() => {for(let i=0;i<42;i++) __app.ticker.fns[0]({deltaMS:50})}''')
        s2=await page.evaluate('window.__swarmInputDebug.units()[0]')
        assert not s2['resting'] and s2['stamina']>20,s2
        assert abs(s2['vx'])>1,s2
        # Unlimited mode must never declare time-based human victory.
        assert await page.locator('#status').inner_text() != 'Finished'
        await page.locator('#settingsOpen').click()
        await page.locator('#settingTabs').get_by_text('General',exact=True).click()
        await page.locator('#unlimitedTime').uncheck()
        assert await page.locator('#survivalTime').is_enabled()
        await page.locator('#survivalTime').fill('15')
        await page.locator('#unlimitedTime').check()
        assert await page.locator('#survivalTime').is_disabled()
        assert not errors,errors
        print('PASS human fatigue, rest, recovery, percent HUD, custom/unlimited timer, fast spawn/simulation settings')
        await ctx.close()
        await browser.close()

if __name__=='__main__': asyncio.run(run())
