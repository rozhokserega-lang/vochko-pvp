import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startLocalGame} from '../scripts/dev-local.mjs';
const server=await startLocalGame(5195),browser=await chromium.launch({channel:'chrome'}),errors=[],report={checks:[]};
await mkdir('reports/pvp-lobby',{recursive:true});
async function player(viewport={width:1670,height:941}){
  const context=await browser.newContext({viewport,permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5195/');return {context,page};
}
async function create(p){await p.page.locator('[data-act="create"]').click();await p.page.locator('.pvp-room .code').waitFor();await p.page.getByText('13 карт + Ядро Нексуса',{exact:true}).waitFor();return {code:await p.page.locator('.code').innerText(),link:await p.page.locator('#roomInvite').inputValue()};}
try{
  const a=await player(),b=await player({width:390,height:844}),room=await create(a);
  const id=await a.page.evaluate(()=>localStorage.getItem('vochko_match'));
  assert.equal(new URL(room.link).searchParams.get('room'),room.code);
  assert.ok(await a.page.locator('.room-id').evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight),'desktop footer fits the viewport');
  await a.page.screenshot({path:'reports/pvp-lobby/desktop.png',animations:'disabled'});
  for(const [type,value]of [['code',room.code],['link',room.link],['id',id]]){await a.page.locator(`[data-copy="${type}"]`).click();assert.equal(await a.page.evaluate(()=>navigator.clipboard.readText()),value);}
  report.checks.push('real room code and invite link; independent copy buttons including ID');
  const mirrored=await a.page.locator('.room-player-opponent .room-player-art').evaluate(n=>getComputedStyle(n).transform);assert.ok(mirrored.startsWith('matrix(-1,'));
  assert.equal(await a.page.locator('.room-player-opponent .room-player-text').evaluate(n=>getComputedStyle(n).transform),'none');
  await a.page.locator('#roomInvite').focus();await a.page.keyboard.press('Tab');assert.equal(await a.page.evaluate(()=>document.activeElement.dataset.copy),'link');
  await a.page.waitForFunction(()=>!document.querySelector('.room-feedback').textContent);await a.page.locator('#roomTitle').click();
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:768,height:1024},{width:1366,height:768}]){
    await a.page.setViewportSize(viewport);
    const width=await a.page.evaluate(()=>({document:document.documentElement.scrollWidth,room:document.querySelector('.pvp-room').scrollWidth,viewport:innerWidth}));
    if(width.room>width.viewport)console.log(await a.page.evaluate(()=>[...document.querySelectorAll('.pvp-room *')].map(n=>({tag:n.tagName,class:n.className,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right})).filter(r=>r.right>innerWidth||r.left<0)));
    assert.ok(width.document<=width.viewport&&width.room<=width.viewport,JSON.stringify(width));
    if(viewport.width===390){await a.page.screenshot({path:'reports/pvp-lobby/mobile-top.png',animations:'disabled'});await a.page.locator('[data-act="exit"]').scrollIntoViewIfNeeded();await a.page.screenshot({path:'reports/pvp-lobby/mobile-bottom.png',animations:'disabled'});}
  }
  report.checks.push('desktop/mobile/tablet: no horizontal overflow; mirrored opponent art; keyboard copy focus');
  await a.context.setOffline(true);await a.page.locator('.room-connection').waitFor({state:'visible'});assert.match(await a.page.locator('.room-connection').innerText(),/Нет соединения/);
  await a.context.setOffline(false);await a.page.locator('.room-connection').waitFor({state:'hidden'});assert.equal(await a.page.locator('.code').innerText(),room.code);
  let fail=true;await a.page.route('**/__local/get-state',async route=>{if(fail){fail=false;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Temporary outage"}'});}return route.continue();});
  await a.page.locator('.room-connection').waitFor({state:'visible'});await a.page.locator('[data-room-retry]').click();await a.page.locator('.room-connection').waitFor({state:'hidden'});
  await a.page.emulateMedia({reducedMotion:'reduce'});assert.equal(await a.page.locator('.room-player-art').first().evaluate(n=>getComputedStyle(n).animationName),'none');
  await a.page.emulateMedia({reducedMotion:'no-preference'});
  await a.page.setViewportSize({width:1670,height:941});await a.page.locator('.pvp-room').evaluate(n=>n.scrollTop=0);
  const starting=a.page.locator('.pvp-room[data-state="starting"]').waitFor();await b.page.goto(room.link);await starting;
  assert.equal(await a.page.locator('.room-spinner').count(),0);assert.equal(await a.page.locator('.room-player-opponent h2').innerText(),'Соперник');
  await Promise.all([a,b].map(p=>p.page.locator('#hand .card').first().waitFor()));
  assert.equal(await b.page.evaluate(()=>localStorage.getItem('vochko_match')),id);
  await b.page.reload();await b.page.locator('#hand .card').first().waitFor();report.checks.push('offline recovery, server retry, reduced motion, invite-link join, connected state, automatic start and F5');
  const c=await player(),d=await player(),codeRoom=await create(c);
  await d.page.locator('[data-open="join"]').click();await d.page.locator('#roomInput').fill(codeRoom.code);await d.page.locator('#joinRoomButton').click();await Promise.all([c,d].map(p=>p.page.locator('#hand .card').first().waitFor()));
  const owner=await player(),cancelled=await create(owner);owner.page.on('dialog',dialog=>dialog.accept());
  let cancelError=true;await owner.page.route('**/__local/leave-room',route=>cancelError?(cancelError=false,route.fulfill({status:503,contentType:'application/json',body:'{"error":"Temporary outage"}'})):route.continue());
  await owner.page.locator('[data-act="exit"]').click();await owner.page.getByText('Не удалось отменить комнату. Проверь соединение и попробуй ещё раз.').waitFor();
  assert.equal(await owner.page.locator('.code').innerText(),cancelled.code);
  await owner.page.locator('[data-act="exit"]').click();await owner.page.locator('[data-act="create"]').waitFor();
  const observer=await player();await observer.page.goto(cancelled.link);await observer.page.locator('.fortress-root').waitFor();assert.match(await observer.page.locator('#lobbyStatus').innerText(),/недоступна/);
  await observer.page.goto('http://127.0.0.1:5195/?room=NOPE00');await observer.page.locator('.fortress-root').waitFor();assert.match(await observer.page.locator('#lobbyStatus').innerText(),/не найдена/);
  report.checks.push('code join; creator cancellation rejects joining; nonexistent room handled');
  assert.deepEqual(errors,[]);report.success=true;console.log('PASS waiting room: copy, layout, network failures, two clients, link/code join, start, reconnect and cancellation');
}finally{await writeFile('reports/pvp-lobby/browser-checks.json',JSON.stringify(report,null,2)+'\n');await browser.close();await server.close();}
