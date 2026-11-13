// Explicit opt-in: creates two anonymous sessions and real test matches.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {simpleCoreTurn} from '../shared/core-bot.js';
if(!process.argv.includes('--allow-live'))throw Error('Real backend test requires --allow-live');
let url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if(!url||!key){
  const raw=JSON.parse(await readFile('tests/.shots/live-public-config.json','utf8'));
  const data=JSON.parse(raw.content[0].text);
  key=data.keys.find(k=>k.type==='publishable'&&!k.disabled)?.api_key;
  url='https://ejjbkxtnjfpjbppcvijm.supabase.co';
}
assert.ok(key&&url);const base=process.env.LIVE_FRONTEND_URL||'http://127.0.0.1:5194/',smoke=process.argv.includes('--smoke');
const server=process.env.LIVE_FRONTEND_URL?null:await createServer({base:'/',define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(url),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify(key)},server:{host:'127.0.0.1',port:5194,strictPort:true}});
await server?.listen();const browser=await chromium.launch({channel:'chrome'});
const errors=[],report={backend:url,frontend:base,started:new Date().toISOString(),rounds:[],matches:[],checks:[]};
const call=async(token,name,body)=>{
  const response=await fetch(`${url}/functions/v1/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  const data=await response.json();if(!response.ok)throw Error(`${name}: ${response.status} ${data.error}`);return data;
};
const state=(p,id)=>call(p.token,'get-state',{matchId:id});
async function waitFor(fn,label,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){if(await fn())return;await new Promise(r=>setTimeout(r,250));}throw Error(`Timeout: ${label}`);}
async function player(){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  const result={context,page,token:null,signals:0};
  page.on('websocket',socket=>socket.on('framereceived',frame=>{
    try{const data=JSON.parse(String(frame.payload));if(Array.isArray(data)&&data.some(v=>v?.event==='state'))result.signals++;}catch{}
  }));
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('[data-act="create"]').waitFor();
  result.token=await page.evaluate(key=>JSON.parse(localStorage.getItem(key))?.access_token,`sb-${new URL(url).hostname.split('.')[0]}-auth-token`);
  assert.ok(result.token);return result;
}
async function settled(p,round){await p.page.waitForFunction(round=>document.querySelector('#roundBadge')?.textContent.trim()===`Раунд ${round}`&&!document.querySelector('#lanes.is-resolving')&&document.querySelector('.core-console')?.dataset.phase==='closed'&&document.querySelector('#hand .card:not(:disabled):not(.used)'),round,{timeout:25000});}
async function place(p,dto){
  await p.page.locator('#hand .card:not(:disabled):not(.used)').first().waitFor();
  const cards=[...dto.me.hand].sort((a,b)=>b.v-a.v);
  const plan=process.argv.includes('--attack-heavy')?{placements:[0,1,2].map(lane=>({lane,attack:cards.slice(lane*2,lane*2+2),defense:cards.slice(6+lane*2,8+lane*2)})),coreCard:cards[12]}:simpleCoreTurn(dto.me.hand,dto.board.me,dto.board.opponent);
  const placements=plan.placements.map(p=>({lane:p.lane,attack:p.attack.map(c=>c.id),defense:p.defense.map(c=>c.id)}));
  await p.page.evaluate(placements=>{
    for(const placement of placements)for(const [kind,cards]of [['atk',placement.attack],['def',placement.defense]]){
      for(const id of cards){const card=[...document.querySelectorAll('#hand [data-card]')].find(n=>n.dataset.card===id);if(!card)throw Error('Missing owned card');card.click();}
      const target=[...document.querySelectorAll('.drop-target[data-lane][data-kind]')].find(n=>Number(n.dataset.lane)===placement.lane&&n.dataset.kind===kind);
      if(!target)throw Error('Missing placement target');target.click();
    }
  },placements);
  await p.page.waitForFunction(()=>document.querySelector('.core-console')?.dataset.phase==='waiting');
  await p.page.evaluate(id=>{[...document.querySelectorAll('#hand [data-card]')].find(n=>n.dataset.card===id).click();document.querySelector('#nexusCore').click();},plan.coreCard.id);
  await p.page.locator('#fightBtn:enabled').waitFor();
  return {placements,coreCardId:plan.coreCard.id,fortifyLane:null};
}
try{
  const a=await player(),b=await player();
  await a.page.locator('[data-act="create"]').click();await a.page.locator('.code').waitFor();
  const code=(await a.page.locator('.code').innerText()).trim();
  await b.page.goto(`${base}?room=${code}`);await b.page.locator('#hand .card').first().waitFor();await a.page.locator('#hand .card').first().waitFor();
  const matchId=await a.page.evaluate(()=>localStorage.getItem('vochko_match'));report.matches.push(matchId);
  assert.equal(await b.page.evaluate(()=>localStorage.getItem('vochko_match')),matchId);
  const rejected=await fetch(`${url}/functions/v1/get-state`,{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({matchId})});assert.equal(rejected.status,401);
  report.checks.push('anonymous auth, invite-link join, unauthorized state rejected');
  for(let round=1;round<=40;round++){
    let [av,bv]=await Promise.all([state(a,matchId),state(b,matchId)]);
    assert.equal(av.round,bv.round);assert.equal(av.me.hand.length,13);assert.equal(av.rules.deckVersion,2);
    assert.equal(av.opponent.hand,undefined);assert.equal(bv.opponent.core,undefined);
    if(round===2){await b.page.reload();await b.page.locator('#hand .card').first().waitFor();await settled(b,round);assert.equal((await state(b,matchId)).round,round);report.checks.push('F5 with invite URL preserves participant and current hand');}
    const plans=await Promise.all([place(a,av),place(b,bv)]),first=round%2?a:b,second=round%2?b:a;
    if(round===1)await second.context.setOffline(true);
    await first.page.locator('#fightBtn').click();
    await waitFor(async()=>(await state(first,matchId)).me.ready,'first player ready');
    const waiting=await state(second,matchId);assert.equal(waiting.opponent.ready,true);assert.equal(waiting.opponent.preparation,undefined);
    await call(first.token,'submit-turn',{matchId,round,...plans[first===a?0:1]});
    if(round===1){await second.context.setOffline(false);await waitFor(async()=>{const log=await second.page.evaluate(()=>window.__animLog??[]);return log.some(e=>e.fn==='refresh'&&e.ver===waiting.version);},'online recovery');report.checks.push('offline/online recovery and idempotent confirmation');}
    await second.page.locator('#fightBtn').click();
    await waitFor(async()=>{const v=await state(a,matchId);return v.round>round||v.status==='finished';},'round resolved');
    [av,bv]=await Promise.all([state(a,matchId),state(b,matchId)]);
    assert.equal(av.round,bv.round);
    for(const field of ['outer','inner','nexus','statuses','shieldPct'])assert.deepEqual(av.board.me[field],bv.board.opponent[field]);
    assert.deepEqual(av.latestRoundReport,bv.latestRoundReport);
    assert.equal(av.me.deck.burnedCards.length,round);assert.equal(bv.me.deck.burnedCards.length,round);
    assert.ok(av.me.hand.every(c=>!av.me.deck.burnedCards.includes(c.id)));assert.equal(av.me.deck.drawPile,undefined);
    report.rounds.push({round,version:av.version,nexus:[av.board.me.nexus,bv.board.me.nexus],finished:av.status==='finished'});
    console.log(`Live PvP round ${round}: Nexus ${av.board.me.nexus}/${bv.board.me.nexus}, ${av.status}`);
    if(smoke){await Promise.all([a,b].map(p=>settled(p,av.round)));break;}
    if(av.status==='finished'){
      assert.ok(av.winner);assert.ok(bv.winner);assert.equal(av.winner==='draw',bv.winner==='draw');
      await Promise.all([a,b].map(p=>p.page.locator('.end-overlay').waitFor({timeout:25000})));
      report.winners=[av.winner,bv.winner];break;
    }
    await Promise.all([a,b].map(p=>settled(p,av.round)));
  }
  if(!smoke){
  assert.ok(report.winners,'match must finish');
  await a.page.getByRole('button',{name:/Реванш/}).click();await b.page.getByRole('button',{name:/Реванш/}).click();
  await waitFor(async()=>{const ids=await Promise.all([a,b].map(p=>p.page.evaluate(()=>localStorage.getItem('vochko_match'))));return ids[0]!==matchId&&ids[0]===ids[1];},'both participants enter rematch');
  const nextId=await a.page.evaluate(()=>localStorage.getItem('vochko_match'));report.matches.push(nextId);
  await Promise.all([a,b].map(p=>p.page.locator('#hand .card').first().waitFor()));
  const next=await state(a,nextId);assert.equal(next.round,1);assert.equal(next.me.deck.burnedCards.length,0);
  assert.equal((await call(a.token,'rematch',{matchId})).matchId,nextId);
  await b.page.reload();await b.page.locator('#hand .card').first().waitFor();assert.equal(await b.page.evaluate(()=>localStorage.getItem('vochko_match')),nextId);
  report.checks.push('full match and final animations on both clients','one shared rematch; duplicate rematch and F5 preserve new match');
  }
  report.realtimeSignals=[a.signals,b.signals];assert.ok(report.realtimeSignals.every(n=>n>0),'both clients must receive real broadcast messages');
  assert.deepEqual(errors,[]);report.success=true;report.finished=new Date().toISOString();
  console.log(smoke?'PASS published client: two-browser PvP round, real Realtime messages and offline recovery':'PASS live production backend: complete two-browser PvP, reconnect, offline recovery, permanent decks, final result and rematch');
}catch(error){
  report.success=false;report.error=error.message;
  report.clients=[];await mkdir('reports/network',{recursive:true});
  for(const [i,context]of browser.contexts().entries())for(const page of context.pages()){
    report.clients.push(await page.evaluate(()=>({url:location.href,text:document.querySelector('.match-screen')?.innerText,selected:[...document.querySelectorAll('#hand .selected')].map(c=>c.dataset.card)})).catch(()=>({closed:true})));
    await page.screenshot({path:`reports/network/failure-${i}.png`,fullPage:true}).catch(()=>{});
  }
  throw error;
}
finally{
  await mkdir('reports/network',{recursive:true});await writeFile(`reports/network/${smoke?'published-smoke':'live-match'}.json`,JSON.stringify(report,null,2)+'\n');
  await browser.close();await server?.close();
}
