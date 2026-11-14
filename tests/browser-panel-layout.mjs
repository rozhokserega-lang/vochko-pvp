import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {startLocalGame} from '../scripts/dev-local.mjs';

const server=await startLocalGame(5198);
let browser;
try{
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome'});
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5198/');
  await page.locator('[data-act="bot"]').click();
  await page.locator('#hand .card').first().waitFor();
  await page.locator('.panel-art').evaluate(img=>img.decode());
  await mkdir('reports/panel-layout',{recursive:true});
  for(const [name,width,height] of [['desktop',1280,900],['short-desktop',1100,700],['landscape',844,390],['phone',390,844]]){
    await page.setViewportSize({width,height});
    const sphere=await page.locator('.panel-sphere').boundingBox();
    for(const team of ['ally','enemy'])for(const size of ['outer','inner']){
      const tower=await page.locator(`.tower.${team}.${size}`).nth(2).boundingBox();
      assert.ok(sphere.y>=tower.y+tower.height,`${name}: sphere covers ${team} ${size} bottom tower`);
    }
    for(const selector of ['.panel-cards','#fightBtn','#panelPower']){
      const box=await page.locator(selector).boundingBox();
      assert.ok(box.y+box.height<=height+1,`${name}: ${selector} leaves viewport`);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    await page.screenshot({path:`reports/panel-layout/${name}.png`});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS real match panel: sphere clears both bottom towers; cards, ready button and HUD fit desktop, short windows and phones');
}finally{await browser?.close();await server.close();}
