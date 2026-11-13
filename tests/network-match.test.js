import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {serverFixture} from './server-fixture.mjs';
import {simpleCoreTurn} from '../shared/core-bot.js';
import {validatePlayerDeck} from '../shared/player-deck.js';
const draft=(f,seat)=>{
  const st=f.match.state,t=simpleCoreTurn(st.hands[seat],st.board[seat===1?'a':'b'],st.board[seat===1?'b':'a']);
  return {placements:t.placements.map(p=>({lane:p.lane,attack:p.attack.map(c=>c.id),defense:p.defense.map(c=>c.id)})),coreCardId:t.coreCard.id,fortifyLane:null};
};
const prepare=async(f,seat,t)=>{
  const body={matchId:'fixture',round:f.match.round,placements:t.placements};
  for(const data of [body,{...body,coreCardId:t.coreCardId}])assert.equal((await f.call('prepare-core',seat,data)).status,200);
};
test('complete two-player Core match: private hands, alternating confirmations, duplicate requests, final result and one rematch',async()=>{
  let seed=100;const f=serverFixture({core:true,persistent:true,seedNext:()=>seed++});
  assert.equal((await f.call('get-state','outsider',{matchId:'fixture'})).status,403);
  while(f.match.status!=='finished'){
    const round=f.match.round,plans=[null,draft(f,1),draft(f,2)];
    for(const seat of [1,2])await prepare(f,seat,plans[seat]);
    const first=round%2?1:2,second=3-first,payload={matchId:'fixture',round,...plans[first]};
    assert.equal((await f.call('submit-turn',first,payload)).status,200);
    assert.equal((await f.call('submit-turn',first,payload)).status,200);
    const waiting=(await f.call('get-state',second,{matchId:'fixture'})).body;
    assert.equal(waiting.opponent.ready,true);assert.equal(waiting.opponent.hand,undefined);assert.equal(waiting.opponent.preparation,undefined);
    assert.equal(f.reports.length,round-1);
    assert.equal((await f.call('submit-turn',second,{matchId:'fixture',round,...plans[second]})).status,200);
    assert.equal(f.reports.length,round);
    const [a,b]=await Promise.all([1,2].map(async seat=>(await f.call('get-state',seat,{matchId:'fixture'})).body));
    assert.equal(a.round,b.round);assert.deepEqual(a.board.me.outer,b.board.opponent.outer);assert.deepEqual(a.latestRoundReport,b.latestRoundReport);
    for(const seat of [1,2]){validatePlayerDeck(f.match.state.decks[seat],f.match.state.hands[seat]);assert.equal(f.match.state.decks[seat].burnedCards.length,round);}
    assert.ok(round<=40);
  }
  const final=(await f.call('get-state',1,{matchId:'fixture'})).body;
  assert.ok(final.winner);assert.ok(final.latestRoundReport);assert.equal(final.canRematch,true);
  assert.equal((await f.call('rematch',1,{matchId:'fixture'})).body.waiting,true);
  const responses=await Promise.all([2,1,2].map(seat=>f.call('rematch',seat,{matchId:'fixture'})));
  assert.ok(responses.every(r=>r.status===200&&r.body.matchId==='fixture-rematch'));assert.equal(f.createdMatches.length,1);
  assert.ok(f.broadcasts.filter(([id,,event])=>id==='fixture'&&event==='rematch').every(([,version])=>version===f.match.version));
  assert.equal(f.createdMatches[0].state.decks[1].burnedCards.length,0);
});
test('joining an existing participant is idempotent; a stranger cannot take an occupied seat',async()=>{
  const f=serverFixture({core:true,persistent:true}),before=structuredClone(f.match);
  for(const seat of [1,2]){
    const response=await f.call('join-room',seat,{roomCode:'test'});
    assert.equal(response.status,200);assert.equal(response.body.seat,seat);
  }
  assert.equal((await f.call('join-room','outsider',{roomCode:'TEST'})).status,409);assert.deepEqual(f.match,before);
});
test('old clients retain legacy hands; explicit Core clients get persistent decks',async()=>{
  for(const core of [false,true]){
    const f=serverFixture();assert.equal((await f.call('create-room',1,{vsBot:true,...(core?{nexusCoreEnabled:true}:{})})).status,200);
    assert.equal(f.match.state.hands[1].length,core?13:14);assert.equal(!!f.match.state.decks,core);
  }
});
test('broadcast uses bounded HTTP delivery, sends only a version signal and cannot fail a committed mutation',async()=>{
  const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/_shared/realtime.ts',import.meta.url),'utf8')).replace('export async function','async function');
  let request;
  const make=fetch=>new Function('Deno','fetch','AbortSignal','console',source+';return broadcastState;')({env:{get:n=>n==='SUPABASE_URL'?'https://example.supabase.co':'server-secret'}},fetch,AbortSignal,{warn:()=>{}});
  await make(async(url,opts)=>{request={url,opts};return {ok:true};})('test',4,'round');
  assert.equal(request.url,'https://example.supabase.co/realtime/v1/api/broadcast');assert.ok(request.opts.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(request.opts.body).messages[0],{topic:'match:test',event:'state',private:false,payload:{matchId:'test',version:4,eventType:'round'}});
  await make(async()=>{throw Error('network down');})('test',4,'round');
  await make(async()=>({ok:false,status:503}))('test',4,'round');
});
test('client recovers lost broadcasts and transient errors; reconnect/focus sync and cleanup work',async()=>{
  const source=readFileSync(new URL('../src/lib/realtime.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/m,'').replaceAll('export function','function');
  const factory=new Function(source+';return createMatchWatcher;')();
  const callbacks={},listeners=new Map();let removed=0,calls=0;
  const host={setInterval:fn=>(callbacks.poll=fn,1),clearInterval:()=>{callbacks.poll=null;},addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n)};
  const channel={on:(_type,_opts,fn)=>(callbacks.broadcast=fn,channel),subscribe:fn=>{callbacks.status=fn;}};
  const stop=factory({channel:()=>channel,removeChannel:async()=>{removed++;}},'test',async()=>{calls++;if(calls===1)throw Error('offline');},host);
  callbacks.status('SUBSCRIBED');await new Promise(setImmediate);assert.equal(calls,1);
  callbacks.poll();await new Promise(setImmediate);assert.equal(calls,2);
  listeners.get('online')();await new Promise(setImmediate);assert.equal(calls,3);
  callbacks.broadcast({payload:{version:2}});await new Promise(setImmediate);assert.equal(calls,4);
  stop();await new Promise(setImmediate);assert.equal(removed,1);assert.equal(listeners.size,0);assert.equal(callbacks.poll,null);
  callbacks.status('SUBSCRIBED');await new Promise(setImmediate);assert.equal(calls,4);
});
