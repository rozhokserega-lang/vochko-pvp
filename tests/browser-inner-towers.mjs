import {createServer} from 'vite';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/ui/arena/arena.css"><link rel="stylesheet" href="/src/ui/arena/tower-crystal.css"><style>body{margin:0;overflow:auto}#lanes.battle{width:min(calc(100vw - 32px),1500px);height:auto;min-height:0;aspect-ratio:16/9;display:block;flex:none;margin:16px auto}</style></head><body><div id="lanes" class="battle"></div><script type="module">
import {battleHTML,applyArenaLayout} from '/src/ui/arena/ArenaScene.js';
import {deck} from '/shared/cards.js';
const cards=deck(),slots=[0,1,2].map(()=>({atk:[cards[7],cards[20]],def:[cards[9],cards[23]]}));
window.fixtureView={seat:1,status:'planning',board:{me:{nexus:80,outer:[0,0,0],inner:[18,9,0],shieldPct:40},opponent:{nexus:80,outer:[0,0,0],inner:[18,9,0],shieldPct:40}}};
window.renderFixture=()=>{document.querySelector('#lanes').innerHTML=battleHTML(window.fixtureView,slots);applyArenaLayout();};window.renderFixture();
</script></body></html>`;
const server=await createServer({base:'/',plugins:[{name:'inner-model-fixture',configureServer(s){s.middlewares.use('/__inner-fixture',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});}}],server:{port:5197,host:'127.0.0.1',strictPort:true}});await server.listen();
const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:1600,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('reports/inner-towers',{recursive:true});
try{
  await page.goto('http://127.0.0.1:5197/__inner-fixture');await page.locator('.tower.inner').first().waitFor();
  await page.locator('.tower-sprite').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  for(const team of ['ally','enemy'])for(const [lane,stage]of [[0,'full'],[1,'damaged'],[2,'ruins']]){
    const target=page.locator(`.tower.${team}.inner`).nth(lane);assert.match(await target.locator('.tower-sprite').getAttribute('src'),new RegExp(`tower-18-${team}-${stage}`));
    assert.equal(await target.locator('.card-slot').count(),stage==='ruins'?0:2);
  }
  await page.screenshot({path:'reports/inner-towers/desktop.png'});
  await page.locator('.tower.ally.inner').nth(0).screenshot({path:'reports/inner-towers/blue-full.png'});
  await page.locator('.tower.enemy.inner').nth(1).screenshot({path:'reports/inner-towers/red-damaged.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'reports/inner-towers/mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.setViewportSize({width:1600,height:960});
  await page.evaluate(()=>{for(const side of Object.values(window.fixtureView.board)){side.outer=[12,12,12];side.inner=[18,18,18];}window.renderFixture();});
  await page.locator('.tower-sprite').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  for(const team of ['ally','enemy']){
    const boxes=await page.locator(`.tower.${team}.inner`).evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {top:b.top,bottom:b.bottom};}));
    for(let i=1;i<boxes.length;i++)assert.ok(boxes[i].top>=boxes[i-1].bottom-0.5,`${team}: adjacent tower sprites overlap`);
    const arena=await page.locator('#lanes').boundingBox();assert.ok(boxes[2].bottom<arena.y+arena.height,`${team}: bottom tower leaves arena`);
  }
  await page.screenshot({path:'reports/inner-towers/all-full-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'reports/inner-towers/all-full-mobile.png'});
  await page.evaluate(()=>{window.fixtureView.board.me.inner[0]=9;window.renderFixture();});assert.match(await page.locator('.tower.ally.inner').first().locator('.tower-sprite').getAttribute('src'),/ally-damaged/);
  await page.evaluate(()=>{window.fixtureView.board.me.inner[0]=0;window.renderFixture();});assert.match(await page.locator('.tower.ally.inner').first().locator('.tower-sprite').getAttribute('src'),/ally-ruins/);
  assert.deepEqual(errors,[]);console.log('PASS inner tower models: both colors, all states, overlays, desktop/mobile and HP transitions');
}finally{await browser.close();await server.close();}
