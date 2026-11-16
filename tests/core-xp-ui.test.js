import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {nexusHealthHTML} from '../src/ui/arena/NexusHealth.js';
import {attackChargeHTML} from '../src/ui/arena/AttackCharge.js';
import {newBoard} from '../shared/engine.js';
import {addCoreXp} from '../shared/core-progression.js';
import {deck} from '../shared/cards.js';
import {startLocalGame} from '../scripts/dev-local.mjs';
test('XP UI: both owners show actual max HP/shield; attack retention includes bonus',()=>{
 const b=newBoard();addCoreXp(b,100);const slots=[0,1,2].map(()=>({atk:[],def:[]}));
 for(const enemy of [true,false]){const html=nexusHealthHTML(b,slots,enemy);assert.match(html,/95 \/ 95/);assert.match(html,/data-permanent="3"/);assert.match(html,/data-max-hp="95"/);}
 const cards=deck().slice(0,2);assert.notEqual(attackChargeHTML(cards),attackChargeHTML(cards,2));assert.match(attackChargeHTML(cards,2),/:2"/);
});
test('XP assets: all thirteen layers decode, contain true transparency and have provenance',async()=>{
 const dir=new URL('../public/assets/nexus-core/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',dir),'utf8'));assert.equal(Object.keys(manifest).length,13);
 for(const [name,source] of Object.entries(manifest)){const image=sharp(await readFile(new URL(name+'.png',dir))),meta=await image.metadata();assert.equal(meta.hasAlpha,true,name);const {data,info}=await image.raw().toBuffer({resolveWithObject:true});let transparent=false;for(let i=3;i<data.length;i+=info.channels)if(data[i]===0){transparent=true;break;}assert.equal(transparent,true,name);assert.equal(source.sha256.length,64);}
});
test('XP HTTP: live local host persists preparation, rejects forged card, resolves bot and serves all PNGs',async()=>{
 const server=await startLocalGame(5197),base='http://127.0.0.1:5197';
 const call=async(name,body)=>{const r=await fetch(base+'/__local/'+name,{method:'POST',headers:{'content-type':'application/json','x-local-user':'xp-http-test'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 try{
  const room=(await call('create-room',{vsBot:true})).body,initial=(await call('get-state',{matchId:room.matchId})).body;assert.equal(initial.rules.coreVersion,2);assert.equal(initial.me.hand.length,13);
  const placements=[0,1,2].map(lane=>({lane,attack:initial.me.hand.slice(lane*4,lane*4+2).map(c=>c.id),defense:initial.me.hand.slice(lane*4+2,lane*4+4).map(c=>c.id)})),body={matchId:room.matchId,round:1,placements};
  assert.equal((await call('prepare-core',body)).status,200);assert.equal((await call('prepare-core',{...body,coreCardId:placements[0].attack[0]})).status,400);
  const coreCardId=initial.me.hand[12].id,accepted=await call('prepare-core',{...body,coreCardId});assert.equal(accepted.status,200);const reload=(await call('get-state',{matchId:room.matchId})).body;assert.deepEqual(reload.me.coreProgress,accepted.body.coreProgress);
  assert.equal((await call('submit-turn',{...body,coreCardId,fortifyLane:null})).status,200);const next=(await call('get-state',{matchId:room.matchId})).body;assert.equal(next.round,2);assert.equal(next.latestRoundReport.cores,undefined);assert.equal(next.board.opponent.coreProgress,undefined);
  const manifest=JSON.parse(await readFile(new URL('../public/assets/nexus-core/manifest.json',import.meta.url),'utf8'));
  for(const name of Object.keys(manifest)){const r=await fetch(base+'/assets/nexus-core/'+name+'.png');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\/png/);await r.arrayBuffer();}
 }finally{await server.close();}
});
