import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {serverFixture} from './server-fixture.mjs';

const server=await createServer({base:'/',server:{host:'127.0.0.1',port:5191,strictPort:true}});await server.listen();
const browser=await chromium.launch({channel:'chrome'}),f=serverFixture({core:true,persistent:true}),errors=[];
const openNexus=process.argv.includes('--open-nexus'),shotPrefix=`deck-v2-${openNexus?'open-nexus-':''}`;
if(openNexus)for(const side of ['a','b']){f.match.state.board[side].outer.fill(0);f.match.state.board[side].inner.fill(0);}
f.match.state.board.a.statuses[0]={burn:2};f.match.state.board.b.statuses[0]={armor:3};
await mkdir('reports/nexus-core-screenshots',{recursive:true});
try{
  const pages=[];
  for(const seat of [1,2]){
    let preparationAttempts=0;
    const context=await browser.newContext({viewport:seat===1?{width:1440,height:1000}:{width:390,height:844},hasTouch:seat===2,isMobile:seat===2});
    await context.route('**/src/lib/supabase.js',r=>r.fulfill({contentType:'application/javascript',body:`export async function ensureSession(){};export function supabase(){return {auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}}}` }));
    await context.route('**/src/lib/realtime.js',r=>r.fulfill({contentType:'application/javascript',body:`export function watchMatch(id,cb){window.__fixtureBroadcast=cb;return ()=>{}}`}));
    await context.route('**/functions/v1/*',async r=>{
      if(r.request().method()==='OPTIONS')return r.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
      const name=new URL(r.request().url()).pathname.split('/').at(-1);
      const transient=seat===1&&name==='prepare-core'&&++preparationAttempts===1;
      const result=transient?{status:503,body:{error:'Проверка повторного соединения'}}:name==='leave-room'?{status:200,body:{ok:true}}:await f.call(name,seat,r.request().postDataJSON());
      await r.fulfill({status:result.status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result.body)});
    });
    const p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));
    await p.addInitScript(()=>localStorage.setItem('vochko_match','fixture'));
    await p.goto('http://127.0.0.1:5191/');await p.locator('#hand .card').first().waitFor();
    assert.equal(await p.locator('#hand .card').count(),13);assert.equal(await p.locator('#nexusCore').isDisabled(),true);assert.equal(await p.locator('#fightBtn').isDisabled(),true);
    const mineStatus=seat===1?'burn':'armor',oppStatus=seat===1?'armor':'burn';
    const ownTarget=openNexus?'.nexus-fortress.ally .nexus-floor[data-lane="0"]':'.tower[data-arena-id="tower-ally-def-0-outer"]';
    const enemyTarget=openNexus?'.nexus-fortress.enemy .nexus-floor[data-lane="0"]':'.tower[data-arena-id="tower-enemy-atk-0-outer"]';
    await p.locator(ownTarget).click();await p.locator('.effects-inspector').waitFor();
    assert.equal(await p.locator(`.effects-inspector .status-detail-${mineStatus}`).count(),1);
    assert.equal(await p.locator(`.effects-inspector .status-detail-${oppStatus}`).count(),0);
    await p.screenshot({path:`reports/nexus-core-screenshots/${shotPrefix}effects-structure-${seat}.png`,fullPage:true});
    await p.locator('.effects-close').click();await p.locator(enemyTarget).click();
    assert.equal(await p.locator(`.effects-inspector .status-detail-${oppStatus}`).count(),1);
    await p.locator('.effects-close').click();
    if(!openNexus){await p.locator('.tower[data-arena-id="tower-ally-def-0-inner"]').click();assert.match(await p.locator('.effects-inspector').innerText(),/Активных эффектов нет/);await p.locator('.effects-close').click();}
    for(const lane of [0,1,2])for(const kind of ['atk','def']){
      await p.locator('#hand .card:not(.used)').nth(0).click();await p.locator('#hand .card:not(.used):not(.selected)').first().click();
      await p.locator(`#lanes .drop-target[data-lane="${lane}"][data-kind="${kind}"]`).click();
    }
    if(seat===1){await p.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Нажми Ядро'));await p.locator('#nexusCore:enabled').click();}
    await p.waitForFunction(()=>document.querySelector('.core-console')?.dataset.phase==='waiting').catch(async error=>{
      await p.screenshot({path:`reports/nexus-core-screenshots/${shotPrefix}failure-${seat}.png`,fullPage:true});
      throw Error(`${error.message}; seat=${seat}; ${await p.locator('.match-screen').innerText()}`);
    });
    assert.equal(await p.locator('#hand .card.used').count(),12);
    await p.reload();await p.locator('#nexusCore:enabled').waitFor();
    assert.equal(await p.locator('#hand .card.used').count(),12,'server restores preparation after reconnect');
    await p.locator('.core-art').evaluate(img=>img.decode());
    await p.locator('.core-details summary').click();
    await p.locator('.core-preview').waitFor({state:'visible'});
    assert.match(await p.locator('.core-preview').innerText(),/Активных эффектов нет/);
    assert.equal(await p.locator('.core-preview li').count(),0);
    await p.screenshot({path:`reports/nexus-core-screenshots/${shotPrefix}preview-${seat}.png`,fullPage:true});
    await p.locator('.core-details summary').click();
    if(seat===1)await p.locator('#hand .card:not(.used)').dragTo(p.locator('#nexusCore'));
    else{await p.locator('#hand .card:not(.used)').tap();await p.locator('#nexusCore').tap();}
    await p.waitForFunction(()=>document.querySelector('.core-console')?.dataset.phase==='absorbed');
    assert.equal(await p.locator('#hand .card').count(),12);assert.equal(await p.locator('#hand .card.used').count(),12);assert.equal(await p.locator('#fightBtn').isEnabled(),true);
    assert.equal(await p.locator('.core-battle-badge').count(),0,'opponent core is not revealed during preparation');
    await p.locator('#nexusCore').click();await p.locator('.effects-inspector').waitFor();
    assert.equal(await p.locator('.effects-inspector li:not(.core-present)').count(),0,'inactive abilities are hidden');
    assert.equal(await p.locator('#hand .card.used').count(),12,'inspection preserves placements');
    const popup=await p.locator('.effects-inspector').boundingBox();assert.ok(popup.x>=0&&popup.x+popup.width<=await p.evaluate(()=>innerWidth));
    await p.screenshot({path:`reports/nexus-core-screenshots/${shotPrefix}effects-core-${seat}.png`,fullPage:true});
    await p.locator('.effects-close').click();
    const layout=await p.evaluate(()=>{
      const core=document.querySelector('#nexusCore').getBoundingClientRect(),fight=document.querySelector('#fightBtn').getBoundingClientRect();
      const overlap=(a,b)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);
      return {width:document.documentElement.scrollWidth,viewport:innerWidth,readyOverlap:overlap(core,fight),towerOverlap:[...document.querySelectorAll('.tower.drop-target')].some(t=>overlap(core,t.getBoundingClientRect()))};
    });
    assert.equal(layout.width,layout.viewport);assert.equal(layout.readyOverlap,false);assert.equal(layout.towerOverlap,false,JSON.stringify(layout));
    await p.screenshot({path:`reports/nexus-core-screenshots/${shotPrefix}selected-${seat}.png`,fullPage:true});
    await p.waitForFunction(()=>!document.querySelector('.core-absorbing,.core-flight-card'));
    await p.screenshot({path:`reports/nexus-core-screenshots/${shotPrefix}settled-${seat}.png`,fullPage:true});
    await p.reload();await p.locator('#fightBtn:enabled').waitFor();
    assert.equal(await p.locator('#hand .card').count(),12,'burned card stays removed after reconnect');
  }
  await pages[0].locator('#fightBtn').click();await pages[0].waitForFunction(()=>document.querySelector('#fightBtn').disabled);
  assert.equal(f.reports.length,0);
  const hidden=(await f.call('get-state',2,{matchId:'fixture'})).body;assert.equal(hidden.opponent.core,undefined);
  await pages[1].locator('#fightBtn').click();await pages[1].waitForFunction(()=>window.__animLog?.some(x=>x.fn==='anim'));
  await pages[0].evaluate(()=>window.__fixtureBroadcast());
  await pages[0].locator('.core-battle-badge').first().waitFor();
  for(const index of [0,1]){
    await pages[0].locator('.core-battle-badge').nth(index).click();
    assert.match(await pages[0].locator('.effects-inspector').innerText(),/Сработавшие усиления Ядра/);
    await pages[0].locator('.effects-close').click();
  }
  await Promise.all(pages.map(async(p,i)=>{
    await p.waitForFunction(()=>document.querySelectorAll('.core-battle-badge').length===2);
    await p.screenshot({path:`reports/nexus-core-screenshots/${shotPrefix}combat-${i+1}.png`,fullPage:true});
    await p.waitForFunction(()=>/2/.test(document.querySelector('#roundBadge')?.textContent)&&document.querySelector('.core-console')?.dataset.phase==='closed',null,{timeout:15000});
    assert.equal(await p.locator('#hand .card').count(),13);assert.equal(await p.locator('#hand .card.used').count(),0);
  }));
  assert.equal(f.reports.length,1);assert.deepEqual(errors,[]);
  assert.equal(f.match.state.decks[1].burnedCards.length,1);assert.equal(f.match.state.decks[1].drawPile.length,26);
  await pages[0].locator('.core-details summary').click();await pages[0].locator('.core-preview').waitFor({state:'visible'});
  pages[0].on('dialog',dialog=>dialog.accept());await pages[0].locator('#exitBtn').click();
  await pages[0].waitForFunction(()=>!document.querySelector('#nexusCore,.core-preview'));
  await pages[0].bringToFront();
  const sprite=await pages[0].evaluate(async()=>{
    const {mountCoreSprite}=await import('/src/ui/nexus-core/SpriteSheet.js');
    const host=document.createElement('div');document.body.append(host);
    const url='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><path fill="red" d="M0 0h10v10H0z"/><path fill="blue" d="M10 0h10v10H10z"/></svg>');
    const player=await mountCoreSprite(host,{url,columns:2,rows:1,frames:2,frameMs:20,reducedMotion:false});
    const started=performance.now();await new Promise(resolve=>{const poll=()=>{const p=player.canvas.getContext('2d').getImageData(5,5,1,1).data;if(p[2]===255||performance.now()-started>2000)resolve();else setTimeout(poll,20);};poll();});
    const pixel=[...player.canvas.getContext('2d').getImageData(5,5,1,1).data];player.stop();
    const reduced=await mountCoreSprite(host,{url,columns:2,rows:1,frames:2,frameMs:20,reducedMotion:true});
    const first=[...reduced.canvas.getContext('2d').getImageData(5,5,1,1).data];reduced.stop();host.remove();return {pixel,first};
  });
  assert.deepEqual(sprite.pixel,[0,0,255,255]);assert.deepEqual(sprite.first,[255,0,0,255]);
  console.log('PASS core PvP: desktop drag, mobile tap, server reconnect, private selection, one battle, round reset, no overflow/overlap/errors');
}finally{await browser.close();await server.close();}
