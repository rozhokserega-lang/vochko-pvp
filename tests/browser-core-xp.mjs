import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {serverFixture} from './server-fixture.mjs';
import {cardXp,addCoreXp} from '../shared/core-progression.js';
const server=await createServer({base:'/',server:{host:'127.0.0.1',port:5194,strictPort:true}});await server.listen();
let browser;const errors=[];
try{
 browser=await chromium.launch({channel:'chrome'});
 await mkdir('reports/nexus-core-screenshots',{recursive:true});
 for(const [width,height] of [[1920,1080],[2560,1440],[1366,768],[390,844]]){
  const mobile=width<1100,context=await browser.newContext({viewport:{width,height},hasTouch:mobile,isMobile:mobile}),f=serverFixture({core:true,persistent:true});
  f.match.state.rules.coreVersion=2;f.match.state.botMatch=true;addCoreXp(f.match.state.board.a,19);
  await context.route('**/src/lib/supabase.js',r=>r.fulfill({contentType:'application/javascript',body:`export async function ensureSession(){};export function supabase(){return {auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}}}`}));
  await context.route('**/src/lib/realtime.js',r=>r.fulfill({contentType:'application/javascript',body:`export function watchMatch(id,cb){window.__fixtureBroadcast=cb;return ()=>{}}`}));
  let failCore=true;
  await context.route('**/functions/v1/*',async r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
   const name=new URL(r.request().url()).pathname.split('/').at(-1),body=r.request().postDataJSON();
   let result;
   if(name==='prepare-core'&&body.coreCardId&&failCore){failCore=false;result={status:503,body:{error:'Проверка повтора'}};}
   else result=await f.call(name,1,body);
   await r.fulfill({status:result.status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result.body)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/assets/nexus-core/')&&r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>localStorage.setItem('vochko_match','fixture'));
  await page.goto('http://127.0.0.1:5194/');await page.locator('#hand .card').first().waitFor();
  assert.equal(await page.locator('#hand .card').count(),13);assert.equal(await page.locator('.nexus-core-panel').count(),1);assert.equal(await page.locator('.core-console').count(),0);
  const layout=await page.evaluate(()=>{const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}};return {arena:r('#arenaScene'),panel:r('.nexus-core-panel'),fight:r('#fightBtn'),overflow:document.documentElement.scrollWidth>innerWidth}});
  assert.equal(layout.overflow,false);assert.ok(layout.arena.w>300,JSON.stringify(layout));assert.ok(Math.abs(layout.arena.w/layout.arena.h-1600/760)<.03);
  assert.ok(layout.fight.bottom<=height+1,JSON.stringify(layout));
  if(!mobile)assert.ok(layout.panel.right<=layout.arena.x+1,JSON.stringify(layout));
  else{await page.locator('.core-compact').tap();assert.equal(await page.locator('.nexus-core-panel').isVisible(),true);await page.locator('.core-panel-close').tap();}
  for(const lane of [0,1,2])for(const kind of ['atk','def']){
   await page.locator('#hand .card:not(.used)').first().click();await page.locator('#hand .card:not(.used):not(.selected)').first().click();
   await page.locator(`#lanes .drop-target[data-lane="${lane}"][data-kind="${kind}"]`).click();
  }
  await page.waitForFunction(()=>document.querySelector('#nexusCore')?.classList.contains('drop-target'));
  await page.reload();await page.locator('#hand .card.used').first().waitFor();assert.equal(await page.locator('#hand .card.used').count(),12);
  const leftover=await page.locator('#hand .card:not(.used)').getAttribute('data-card');
  const expected=19+cardXp(f.match.state.hands[1].find(c=>c.id===leftover));
  const drop=page.locator(mobile?'.core-compact':'#nexusCore');
  // Pointer interaction exercises the same mouse/touch handler used in production.
  await page.locator('#hand .card:not(.used)').dragTo(drop);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Проверка повтора'));
  assert.equal(await page.locator('#hand .card:not(.used)').count(),1);assert.equal(f.match.state.board.a.coreProgress.xp,19);
  if(mobile){await page.locator('#hand .card:not(.used)').tap();await page.locator('.core-compact').tap();await page.locator('#nexusCore').tap();}
  else await page.locator('#hand .card:not(.used)').dragTo(drop);
  await page.waitForFunction(()=>document.querySelector('.core-xp-value')?.textContent!=='19 / 100 XP');
  assert.equal(f.match.state.board.a.coreProgress.xp,expected);assert.equal(f.match.state.board.a.nexus,85);assert.equal(await page.locator('.core-upgrades .is-unlocked').count(),1);assert.equal(await page.locator('#fightBtn').isEnabled(),true);
  await page.reload();await page.locator('#fightBtn:enabled').waitFor();assert.equal(await page.locator('#hand .card').count(),12);assert.match(await page.locator('.core-xp-value').textContent(),new RegExp(`^${expected} / 100`));
  if(mobile)await page.locator('.core-compact').tap();
  await page.screenshot({path:`reports/nexus-core-screenshots/xp-${width}x${height}.png`,fullPage:true});
  if(mobile)await page.locator('.core-panel-close').tap();
  await page.locator('#fightBtn').click();await page.waitForFunction(()=>window.__animLog?.some(x=>x.fn==='anim')||document.querySelector('#status')?.textContent.includes('раунд'),null,{timeout:10000}).catch(()=>{});
  assert.equal(f.reports.length,1);assert.ok(f.match.state.board.b.coreProgress.xp>=2);assert.equal(f.reports[0].public_result.cores,undefined);
  await context.close();console.log(`PASS ${width}x${height}: layout, drag, retry, XP, F5, bot`);
 }
 assert.deepEqual(errors,[]);console.log('Browser checks passed');
}finally{await browser?.close();await server.close();}
