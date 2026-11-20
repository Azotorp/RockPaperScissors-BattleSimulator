"""Real WebGL tests for sprite layering, fixed diagrams, animation, palette and fallback."""
import asyncio
import io
import json
import os
from urllib.parse import urlparse
from PIL import Image, ImageChops
from playwright.async_api import async_playwright
from visual_phase1 import ROOT, ORIGIN, routes


async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.getenv('SWARM_CHROMIUM','/usr/bin/chromium'),
            args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx=await browser.new_context(viewport={'width':1000,'height':700},has_touch=True)
        await routes(ctx)
        await ctx.add_init_script('window.__forceSwarmDebug=true')
        manifest=json.loads((ROOT/'assets/themes/classic/theme.json').read_text())
        art={'frames':['creatures/human.png','creatures/human-scared.png'],'fps':10,'pivot':[.5,.5],'size':[1254,1254],'facingDegrees':-90}
        manifest.update(id='fixture',displayName='Fixture',states={'R':art})
        async def registry(route):
            body=(ROOT/'assets/themes/registry.js').read_text()+'\nSwarmRegistry.fixture='+json.dumps(manifest)+';'
            await route.fulfill(body=body,content_type='application/javascript')
        await ctx.route('**/assets/themes/registry.js',registry)
        async def fixture(route):
            path=urlparse(route.request.url).path.replace('/fixture/','/classic/').lstrip('/')
            await route.fulfill(path=str(ROOT/path))
        await ctx.route('**/assets/themes/fixture/**',fixture)
        page=await ctx.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        await page.goto(ORIGIN)
        await page.wait_for_function('!!window.SwarmVisuals')
        await page.locator('[data-close=statsPanel]').click()
        await page.locator('[data-close=spawnPanel]').click()
        # Existing sprites survive the swap and a real AnimatedSprite advances.
        await page.evaluate("SwarmSettings.setSetting('theme.id','fixture')")
        await page.wait_for_function("SwarmThemes.id==='fixture' && SwarmVisuals.diagnostics().animatedStates===1")
        frames=await page.evaluate("""async()=>{const s=SwarmThemes.make('R');const first=s.currentFrame;
          await new Promise(r=>setTimeout(r,125));const now=s.currentFrame;s.destroy();return [first,now]}""")
        if frames[0]==frames[1]:
            assert await page.evaluate("""async()=>{const s=SwarmThemes.make('R');let changed=false;
              s.onFrameChange=()=>changed=true;await new Promise(r=>setTimeout(r,750));s.destroy();return changed}""")
        assert await page.evaluate("SwarmThemes.resolveAppearance('fixture','human','Hi').frames[0].includes('/classic/')")
        await page.evaluate("SwarmSettings.setSetting('theme.id','classic')")
        await page.wait_for_function("SwarmThemes.id==='classic' && SwarmVisuals.diagnostics().animatedStates===0")
        assert await page.evaluate("SwarmThemes.make('R').constructor===PIXI.Sprite")
        assert await page.locator('#diagram [data-node=rock] image').get_attribute('href')=='assets/themes/classic/creatures/rock.png'
        before=await page.locator('#diagram [data-node=rock]').bounding_box()
        for delta in [50000,-50000]:
            await page.evaluate("""d=>{const canvas=document.querySelector('#game canvas');
              for(let i=0;i<120;i++)canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:d,clientX:480,clientY:300,cancelable:true}));}""",delta)
            after=await page.locator('#diagram [data-node=rock]').bounding_box()
            assert after==before
            grid=await page.evaluate("SwarmVisuals.grid()")
            assert 98<=grid['gap']<=501,grid
        await page.evaluate("""()=>{SwarmSettings.setSetting('modes.3.camera',{x:400,y:350,zoom:1});document.querySelector('#fit').click();
          SwarmSettings.setSetting('modes.3.colors.rock','#11aa22');
          const el=document.querySelector('.overview-item[data-kind=rock]');if(getComputedStyle(el).color!=='rgb(17, 170, 34)')throw Error('palette');
        }""")
        # Browser composites arena actors above the independently faded diagram.
        # Compare the same paused actor's pixels over two dramatic underlays.
        await page.evaluate("""()=>{SwarmSettings.setSetting('modes.3.population',1);
          document.querySelector('#reset').click();
          const actor=__swarmInputDebug.units()[0];const k=document.querySelector('#diagram');
          k.style.cssText='inset:0;transform:none;width:100%;height:100%;max-width:none;max-height:none;opacity:1;background:#ff0000';
          window.sampleActor=actor;
        }""")
        actor=await page.evaluate('sampleActor')
        x,y=round(actor['x']),round(actor['y'])
        crop={'x':max(0,x-3),'y':max(0,y-3),'width':6,'height':6}
        a=Image.open(io.BytesIO(await page.screenshot(clip=crop))).convert('RGB')
        await page.evaluate("document.querySelector('#diagram').style.background='#00ff00'")
        b=Image.open(io.BytesIO(await page.screenshot(clip=crop))).convert('RGB')
        diff=ImageChops.difference(a,b)
        assert sum(1 for r,g,_ in [diff.getpixel((x,y)) for x in range(diff.width) for y in range(diff.height)] if r+g<16)>=12,'Diagram changed opaque actor pixels'
        await page.set_viewport_size({'width':390,'height':844})
        await page.evaluate("""()=>{SwarmSettings.setSetting('hud.toolbar.auto',true);SwarmSettings.setSetting('hud.toolbar.enter',0);
          SwarmSettings.setSetting('hud.toolbar.exit',0);}""")
        await page.locator('.edge-toolbar').tap()
        await page.wait_for_function("!document.querySelector('.launchers').classList.contains('collapsed')")
        await page.locator('#settingsOpen').click()
        assert await page.locator('#settingsWindow').is_visible()
        assert not errors, errors
        await browser.close()
        print('PASS real animated fixture switch and cleanup, fallback, static Sprite, fixed diagram size at extreme zoom, bounded grid spacing, palette, unaffected actor pixels, mobile reveal and settings')


if __name__=='__main__':asyncio.run(main())
