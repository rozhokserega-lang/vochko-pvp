import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serverFixture} from './server-fixture.mjs';
import {createGameState,resolveRound} from '../shared/engine.js';
import {deck,deal,dealBalancedLegacy} from '../shared/cards.js';
import {botPlan,evaluateState,choosePlan} from '../shared/bot.js';
import {mulberry32} from '../shared/rng.js';
import {RECOMMENDED,statusDetails,abilityDescription,planningStats} from '../shared/abilities.js';
import {statusPanelHTML,canInspectStatus} from '../src/ui/arena/StatusBadges.js';
const opts={abilities:true,counters:true,variants:RECOMMENDED,rng:()=>0};
const C=id=>deck().find(c=>c.id===id);
const t=(rows)=>({placements:rows.map(([a,d],lane)=>({lane,attack:a.map(C),defense:d.map(C)}))});
const turnFor=(m,seat)=>({matchId:m.id,round:m.round,placements:botPlan(m.state.hands[seat],m.state.board[seat===1?'b':'a'],m.state.board[seat===1?'a':'b']).map(p=>({lane:p.lane,attack:p.attack.map(c=>c.id),defense:p.defense.map(c=>c.id)}))});
test('real room lifecycle preserves versioned rules, seed, both public views and own-only committed turn',async()=>{
  const f=serverFixture();const created=await f.call('create-room',1,{});assert.equal(created.status,200);
  const m=f.matches.find(m=>m.id===created.body.matchId);assert.equal(m.state.rules.dealMode,'random');
  const joined=await f.call('join-room',2,{roomCode:m.room_code});assert.equal(joined.status,200);
  assert.deepEqual(m.state.rules.variants,RECOMMENDED);assert.equal(m.state.rules.abilities,true);assert.equal(m.state.rngSeed,42);
  assert.equal((await f.call('join-room',2,{roomCode:m.room_code})).body.matchId,m.id);
  assert.equal((await f.call('join-room',1,{roomCode:m.room_code})).status,200);
  assert.equal((await f.call('join-room','stranger',{roomCode:m.room_code})).status,409);
  m.state.board.a.statuses[0]={burn:2};m.state.board.b.statuses[1]={armor:3};
  const a=turnFor(m,1),b=turnFor(m,2);
  assert.equal((await f.call('submit-turn',1,a)).status,200);
  let va=(await f.call('get-state',1,{matchId:m.id})).body,vb=(await f.call('get-state',2,{matchId:m.id})).body;
  assert.deepEqual(va.me.placements,a.placements);assert.equal(vb.me.placements,null);assert.equal(vb.opponent.placements,undefined);assert.equal(vb.opponent.hand,undefined);
  assert.deepEqual(va.board.me.statuses,vb.board.opponent.statuses);assert.deepEqual(va.board.opponent.statuses,vb.board.me.statuses);
  assert.equal((await f.call('submit-turn',2,b)).status,200);
  va=(await f.call('get-state',1,{matchId:m.id})).body;vb=(await f.call('get-state',2,{matchId:m.id})).body;
  assert.ok(va.latestRoundReport.abilityEvents);assert.deepEqual(va.latestRoundReport,vb.latestRoundReport);assert.deepEqual(va.board.me.statuses,vb.board.opponent.statuses);
});
test('real PvE and PvP rematches are idempotent and keep abilities/AI/deal variants',async()=>{
  for(const bot of [true,false]){
    const f=serverFixture();const c=await f.call('create-room',1,{vsBot:bot});assert.equal(c.status,200);let m=f.matches.find(m=>m.id===c.body.matchId);
    if(!bot)await f.call('join-room',2,{roomCode:m.room_code});m.status='finished';
    let result=await f.call('rematch',1,{matchId:m.id});
    if(!bot){assert.equal(result.body.waiting,true);result=await f.call('rematch',2,{matchId:m.id});}
    assert.equal(result.body.waiting,false);let n=f.matches.find(m=>m.id===result.body.matchId);assert.deepEqual(n.state.rules,m.state.rules);assert.equal(n.state.rngSeed,42);assert.equal(n.state.botMatch,bot);
    const count=f.matches.length;const repeated=await f.call('rematch',1,{matchId:m.id});assert.equal(repeated.body.matchId,n.id);assert.equal(f.matches.length,count);
  }
});
test('leave and explicit member reconnect are reflected in both views without a new deal',async()=>{
  const f=serverFixture(),m=f.match,hand=structuredClone(m.state.hands);
  assert.equal((await f.call('leave-room',2,{matchId:m.id})).status,200);
  assert.equal((await f.call('get-state',1,{matchId:m.id})).body.opponent.connected,false);
  assert.equal((await f.call('join-room',2,{roomCode:m.room_code})).status,200);
  assert.equal((await f.call('get-state',1,{matchId:m.id})).body.opponent.connected,true);assert.deepEqual(m.state.hands,hand);
});
test('existing matches without deal version retain 7/7 while new ones explicitly use random',async()=>{
  const modes=[];const f=serverFixture({dealHand:mode=>{modes.push(mode);return(mode==='balanced'?dealBalancedLegacy:deal)(mulberry32(11));}});
  const m=f.match;await f.call('submit-turn',1,turnFor(m,1));await f.call('submit-turn',2,turnFor(m,2));assert.deepEqual(modes,['balanced','balanced']);
  for(const h of Object.values(m.state.hands))assert.equal(h.filter(c=>'♥♦'.includes(c.s)).length,7);
});
test('reflection cannot retarget the simultaneous primary shot onto an inner tower',()=>{
  const a=t([[['♠10','♦9'],['♥J','♣4']],[['♦K','♥A'],['♣6','♣A']],[['♦4','♦5'],['♣10','♠8']]]);
  const b=t([[['♦6','♦2'],['♠K','♠7']],[['♦5','♣7'],['♦K','♥3']],[['♠9','♣8'],['♣2','♣9']]]);
  const s=createGameState();s.a.outer=[0,8,0];s.a.inner=[0,18,14];s.b.outer=[10,1,0];s.b.inner=[18,18,1];
  const reverse={round:1,a:structuredClone(s.b),b:structuredClone(s.a)};resolveRound(s,a,b,opts);resolveRound(reverse,b,a,opts);
  assert.equal(s.b.inner[1],18);assert.deepEqual(s.a,reverse.b);assert.deepEqual(s.b,reverse.a);
});
test('1000 asymmetric states retain mirrored HP and statuses with simultaneous secondary effects',()=>{
  const rng=mulberry32(781),turn=()=>{let h=deal(rng);return{placements:[0,1,2].map(lane=>({lane,attack:h.slice(lane*4,lane*4+2),defense:h.slice(lane*4+2,lane*4+4)}))}};
  for(let i=0;i<1000;i++){
    const s=createGameState();for(const side of ['a','b'])for(let l=0;l<3;l++){s[side].outer[l]=rng()<.3?0:1+Math.floor(rng()*12);s[side].inner[l]=s[side].outer[l]?18:Math.floor(rng()*19);}
    const reverse={round:1,a:structuredClone(s.b),b:structuredClone(s.a)},a=turn(),b=turn();resolveRound(s,a,b,opts);resolveRound(reverse,b,a,opts);assert.deepEqual(s.a,reverse.b,'a seed index '+i);assert.deepEqual(s.b,reverse.a,'b seed index '+i);
  }
});
test('losing the final HP of own inner tower is always worse for AI',()=>{const s=createGameState();s.a.outer[0]=0;s.a.inner[0]=1;const before=evaluateState(s,'a');s.a.inner[0]=0;assert.ok(evaluateState(s,'a')<before);});
test('cleansing is before burn, local to the lane, and counter event is emitted once',()=>{
  const a=t([[['♠2','♠3'],['♠K','♠A']],[['♠4','♠5'],['♦K','♦A']],[['♠6','♠7'],['♠9','♠10']]]);
  for(const lane of [0,1]){
    const b=structuredClone(a),s=createGameState();s.a.statuses[1]={burn:2};b.placements[lane].attack=[C('♦2'),C('♣3')];
    const r=resolveRound(s,a,b,opts);assert.equal(r.abilityEvents.filter(e=>e.canceled==='water_cleanse'&&e.side==='a').length,lane===1?1:0);assert.equal(s.a.outer[1],lane===1?10:12);assert.equal(s.a.statuses[1].burn,undefined);
  }
});
test('descriptions and planning power use the selected match variants and public statuses',()=>{
  assert.match(statusDetails('armor',3,{variants:RECOMMENDED}).counterplay,/до 2/);assert.match(statusDetails('attackBoost',2,{}).counterplay,/Земля/);
  assert.match(abilityDescription('fire_retaliation',RECOMMENDED),/пробитии/);assert.match(abilityDescription('sandstorm_shield',RECOMMENDED),/3/);
  const p={attack:[C('♥K'),C('♥A')],defense:[C('♠5'),C('♣6')]};
  const preview=planningStats(p,{attackBoost:2,weakenAttack:15,armor:3},{abilities:true,variants:RECOMMENDED});assert.equal(preview.attack,Math.round((46+2)*.85));assert.ok(preview.shield>0);
  const panel=statusPanelHTML({burn:2,armor:3},{mine:false,rules:{counters:true,variants:RECOMMENDED},structure:{name:'Внешняя башня',hp:8,max:12,effects:[{key:'burn',value:2},{key:'armor',value:3}]}});
  assert.match(panel,/8 \/ 12/);assert.match(panel,/Горение/);assert.match(panel,/на эту же линию/);assert.match(panel,/до 2/);assert.doesNotMatch(panel,/hand|placements/);
});

test('structure inspection never intercepts selected-card or drag placement, including Nexus root',()=>{
  assert.equal(canInspectStatus({}),true);
  assert.equal(canInspectStatus({hasSelection:()=>true}),false);
  assert.equal(canInspectStatus({isDragging:()=>true}),false);
  assert.equal(canInspectStatus({hasSelection:()=>false,isDragging:()=>false}),true);
});
