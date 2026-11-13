import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {simpleCoreTurn} from '../shared/core-bot.js';
if(!process.argv.includes('--allow-live'))throw Error('Requires --allow-live');
const config=JSON.parse(JSON.parse(await readFile('tests/.shots/live-public-config.json','utf8')).content[0].text);
const key=config.keys.find(k=>k.type==='publishable'&&!k.disabled).api_key,url='https://ejjbkxtnjfpjbppcvijm.supabase.co';
const clients=[0,1].map(()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}));
const tokens=await Promise.all(clients.map(async c=>{const {data,error}=await c.auth.signInAnonymously();if(error)throw error;return data.session.access_token;}));
const matches=[],report={backend:url,checks:[],matches};
const request=async(seat,name,body)=>{
  const response=await fetch(`${url}/functions/v1/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${tokens[seat]}`,'content-type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
};
const call=async(...args)=>{const r=await request(...args);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
try{
  const old=await call(0,'create-room',{});matches.push(old.matchId);await call(1,'join-room',{roomCode:old.roomCode});
  assert.equal((await call(0,'get-state',{matchId:old.matchId})).me.hand.length,14);report.checks.push('legacy client receives 14 cards');
  const created=await call(0,'create-room',{nexusCoreEnabled:true});matches.push(created.matchId);const matchId=created.matchId;
  await call(1,'join-room',{roomCode:created.roomCode});
  const views=await Promise.all([0,1].map(seat=>call(seat,'get-state',{matchId}))),turns=[];
  for(const [seat,v]of views.entries()){
    const t=simpleCoreTurn(v.me.hand,v.board.me,v.board.opponent),placements=t.placements.map(p=>({lane:p.lane,attack:p.attack.map(c=>c.id),defense:p.defense.map(c=>c.id)}));
    await call(seat,'prepare-core',{matchId,round:1,placements});await call(seat,'prepare-core',{matchId,round:1,placements,coreCardId:t.coreCard.id});
    turns.push({matchId,round:1,placements,coreCardId:t.coreCard.id,fortifyLane:null});
  }
  const results=await Promise.all([0,1,0,1].map(seat=>request(seat,'submit-turn',turns[seat])));
  assert.ok(results.every(r=>[200,409].includes(r.status)),JSON.stringify(results));
  const final=await Promise.all([0,1].map(seat=>call(seat,'get-state',{matchId})));
  for(const v of final){assert.equal(v.round,2);assert.equal(v.me.deck.burnedCards.length,1);assert.equal(v.me.hand.length,13);assert.equal(v.latestRoundReport.report[0].round,1);}
  assert.deepEqual(final[0].latestRoundReport,final[1].latestRoundReport);
  report.checks.push('four simultaneous confirmations resolve exactly once','one burn per player; same public report and next round on both clients');
  report.statuses=results.map(r=>r.status);report.success=true;console.log('PASS live concurrent confirmations and legacy-client compatibility');
}finally{
  await mkdir('reports/network',{recursive:true});await writeFile('reports/network/concurrency.json',JSON.stringify(report,null,2)+'\n');
  await Promise.all(clients.map(c=>c.auth.signOut()));
}
