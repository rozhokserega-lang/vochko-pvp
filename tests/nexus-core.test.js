import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CORE_ABILITIES,coreTier,coreDescriptor,coreElements,dealCoreHand,coreAbilityBonus} from '../shared/nexus-core.js';
import {ABILITIES,counterOf,effectiveLine,hitConsequences,applyStatuses,emptyStatuses} from '../shared/abilities.js';
import * as E from '../shared/engine.js';
import {ELEMENTS,pairStats} from '../shared/elements.js';
import {mulberry32} from '../shared/rng.js';
import {C} from './helpers.js';
import {materializeTurn,validateTurn} from '../shared/validation.js';
import {chooseCorePlan,simpleCoreTurn} from '../shared/core-bot.js';
import {serverFixture} from './server-fixture.mjs';

const pair=id=>[...ELEMENTS[id].suits].map((s,i)=>C(s,i?'K':'A'));
const turn=(atk,def)=>({placements:[0,1,2].map(lane=>({lane,attack:pair(atk),defense:pair(def)}))});
const io={damage:E.damage,damageStage:E.damageStage,recordDamage:E.recordDamage,healStructure:E.healStructure,snapshot:E.snapshotForRecord};
const serialize=plan=>({placements:plan.placements.map(p=>({lane:p.lane,attack:p.attack.map(c=>c.id),defense:p.defense.map(c=>c.id)})),fortifyLane:null,coreCardId:plan.coreCard.id});
const draft=(f,seat)=>serialize(simpleCoreTurn(f.match.state.hands[seat],f.match.state.board[seat===1?'a':'b'],f.match.state.board[seat===1?'b':'a']));
const prepare=async(f,seat,t)=>{
  const body={matchId:'fixture',round:f.match.round,placements:t.placements};
  assert.equal((await f.call('prepare-core',seat,body)).status,200);
  assert.equal((await f.call('prepare-core',seat,{...body,coreCardId:t.coreCardId})).status,200);
};
test('13 random physical cards; one-deal exclusion expires, no cross-player uniqueness rule',()=>{
  for(let seed=0;seed<100;seed++){
    const h=dealCoreHand(mulberry32(seed));assert.equal(h.length,13);assert.equal(new Set(h.map(c=>c.id)).size,13);
    const banned=h[0].id;assert.ok(!dealCoreHand(mulberry32(seed),[banned]).some(c=>c.id===banned));
    assert.deepEqual(dealCoreHand(mulberry32(seed)),h);
  }
  assert.throws(()=>dealCoreHand(Math.random,['♥A','♦A']));
});
test('tiers and all pure/mixed suit memberships are canonical',()=>{
  for(const [r,tier]of [['2',1],['6',1],['7',2],['10',2],['J',3],['Q',3],['K',3],['A',4]])assert.equal(coreTier(C('♥',r)),tier);
  for(const s of ['♥','♦','♠','♣']){assert.equal(coreElements(s).length,4);assert.ok(coreElements(s).every(e=>e.suits.includes(s)));}
  assert.equal(coreDescriptor({id:'forged',s:'♥',r:'A'}),null);
});
for(const [id,design]of Object.entries(CORE_ABILITIES))for(const [index,rank]of ['2','7','J','A'].entries())test(`${id}: real ability integration tier ${index+1}`,()=>{
  const ability=ABILITIES[id],owner=ability.role==='attack'?'a':'b',card=C(ELEMENTS[design.element].suits[0],rank);
  const state=E.createGameState(),disabled=new Set(Object.keys(ABILITIES).filter(k=>k!==id));
  const ctx={state,io,nexusPct:{a:0,b:0},disabled,events:[],abilityEvents:[],next:{a:emptyStatuses(),b:emptyStatuses()},applied:{a:[{},{},{}],b:[{armor:9},{},{}]},burned:{a:[true,true,true],b:[true,true,true]},cores:{[owner]:card}};
  const bonus=key=>coreAbilityBonus(ctx,owner,id,key);
  assert.ok(Object.keys(design).filter(k=>k!=='element').every(k=>bonus(k)>0));
  const p={ctx,state,attackerSide:'a',lane:1,atkElement:ability.role==='attack'?design.element:'earth',defElement:ability.role==='defense'?design.element:'earth',hit:['lava_counter','thunderstorm_charge'].includes(id)?2:ability.role==='attack'?2:0,absorbed:3,rng:()=>0};
  if(id==='water_cleanse'){
    state.b.outer[1]=5;
    const tA=turn('earth','earth'),tB=turn('earth','water');
    applyStatuses(state,{turnA:tA,turnB:tB,nexusPct:{a:0,b:0},rng:()=>0,disabled,events:[],abilityEvents:[],io,cores:{b:card}});
    assert.equal(state.b.outer[1],5+2+bonus('heal'));return;
  }
  const mods=effectiveLine({...p,atkStat:100,defStat:80});
  if(id==='earth_pierce_def')assert.equal(mods.defense,Math.round(80*(1-(15+bonus('percent'))/100)));
  if(id==='lava_pierce_burn')assert.equal(mods.defense,Math.round(80*(1-(10+bonus('percent'))/100)));
  if(id==='water_strip_armor'){
    ctx.applied.b[1]={armor:9};const m=effectiveLine({...p,atkStat:100,defStat:80});assert.equal(m.armorStripped,Math.min(9,3+bonus('strip')));
  }
  if(id==='sandstorm_shield')assert.equal(mods.defense,84+bonus('shield'));
  if(id==='steam_dampen')assert.equal(mods.hit,Math.round(20*(1-(10+bonus('percent'))/100)));
  if(id==='fire_vortex_zaslon')assert.equal(mods.attack,Math.round(100*(1-(10+bonus('percent'))/100)));
  state.b.outer[1]=5;
  hitConsequences(p);
  const statusChecks={fire_burn:['b',1,'burn',2],lava_pierce_burn:['b',1,'burn',1],fire_vortex_spread:['b',0,'burn',1],air_weaken_def:['b',1,'weakenDefense',10],steam_weaken_def:['b',1,'weakenDefense',15],ice_weaken_def:['b',1,'weakenDefense',10],sandstorm_weaken_atk:['b',1,'weakenAttack',15],earth_armor:['b',1,'armor',3],ice_weaken_atk:['a',1,'weakenAttack',15],thunderstorm_charge:['b',1,'attackBoost',2]};
  if(statusChecks[id]){const [side,lane,key,base]=statusChecks[id],kind=key==='burn'?'burn':key==='armor'?'armor':key==='attackBoost'?'charge':'percent';const cap=key==='burn'?6:key==='armor'?9:key==='attackBoost'?6:30;assert.equal(ctx.next[side][lane][key],Math.min(cap,base+bonus(kind)));}
  if(['fire_retaliation','air_reflect','lava_counter','thunderstorm_discharge'].includes(id))assert.equal(ctx.abilityEvents.find(e=>e.ability===id).amount,2+bonus('damage'));
  if(id==='steam_dampen')assert.equal(state.b.outer[1],5+2+bonus('heal'));
});
for(const ability of Object.values(ABILITIES))for(const rank of ['2','7','J','A'])test(`counter still blocks ${ability.id} core ${rank}`,()=>{
  const own=pair(ability.element),counter=counterOf(ability.element),tA=ability.role==='attack'?turn(ability.element,counter):turn(counter,'earth'),tB=ability.role==='attack'?turn('earth',counter):turn('earth',ability.element);
  const owner=ability.role==='attack'?'a':'b';
  if(owner==='a')tA.coreCard=C(own[0].s,rank);else tB.coreCard=C(own[0].s,rank);
  const a=E.createGameState(),b=E.cloneGameState(a),opts={abilities:true,counters:true,disabled:Object.keys(ABILITIES).filter(id=>id!==ability.id),rng:mulberry32(3)};
  E.resolveRound(a,tA,tB,{...opts,nexusCoreEnabled:true});E.resolveRound(b,tA,tB,{...opts,rng:mulberry32(3)});
  assert.deepEqual(a,b);
});
test('core validation consumes exactly the last owned card and rejects stats/duplicates',()=>{
  const h=dealCoreHand(mulberry32(9)),s=E.createGameState(),t=serialize(simpleCoreTurn(h,s.a,s.b));
  assert.ok(validateTurn(h,t,{nexusCoreEnabled:true}).ok);
  assert.equal(materializeTurn(h,t,{nexusCoreEnabled:true}).coreCard.id,t.coreCardId);
  for(const bad of [{...t,coreCardId:t.placements[0].attack[0]},{...t,coreCardId:'forged'},{...t,power:100},{...t,coreCardId:undefined}])assert.equal(validateTurn(h,bad,{nexusCoreEnabled:true}).ok,false);
});
test('Core never changes ordinary pair power when unique abilities are disabled',()=>{
  const state=E.createGameState(),a=simpleCoreTurn(dealCoreHand(mulberry32(1)),state.a,state.b),b=simpleCoreTurn(dealCoreHand(mulberry32(2)),state.b,state.a);
  const copy=E.cloneGameState(state),options={abilities:true,counters:true,disabled:Object.keys(ABILITIES),rng:mulberry32(3)};
  const enhanced=E.resolveRound(state,a,b,{...options,nexusCoreEnabled:true});
  const original=E.resolveRound(copy,a,b,{...options,rng:mulberry32(3)});
  assert.deepEqual(state,copy);assert.deepEqual(enhanced.report,original.report);
});
test('same physical ids in two independent player decks remain legal',async()=>{
  const f=serverFixture({core:true});f.match.state.hands[2]=structuredClone(f.match.state.hands[1]);
  const a=draft(f,1),b=draft(f,2);assert.equal(a.coreCardId,b.coreCardId);
  await prepare(f,1,a);await prepare(f,2,b);
  await f.call('submit-turn',1,{matchId:'fixture',round:1,...a});
  const result=await f.call('submit-turn',2,{matchId:'fixture',round:1,...b});
  assert.equal(result.status,200);assert.equal(f.reports.length,1);
});
test('Core AI is deterministic, legal, non-mutating and independent of server seat',()=>{
  const state=E.createGameState(),hand=dealCoreHand(mulberry32(13));state.a.outer[1]=4;
  const original=E.cloneGameState(state),run=(s,side)=>chooseCorePlan({state:s,hand,side,rng:mulberry32(4),samples:1,budgetMs:Infinity});
  const a=run(state,'a'),b=run({round:state.round,a:state.b,b:state.a},'b');
  assert.deepEqual(a.plan,b.plan);assert.equal(a.score,b.score);assert.deepEqual(state,original);
  assert.ok(validateTurn(hand,serialize(a.plan),{nexusCoreEnabled:true}).ok);assert.equal(a.stats.evaluated,13);
});
test('zero AI budget returns a legal optimized fallback instead of waiting for a core',()=>{
  const state=E.createGameState(),hand=dealCoreHand(mulberry32(17)),fallback=simpleCoreTurn(hand,state.a,state.b);
  const result=chooseCorePlan({state,hand,rng:mulberry32(8),budgetMs:0});
  assert.equal(result.stats.evaluated,1);assert.equal(result.plan.coreCard.id,fallback.coreCard.id);
  assert.ok(validateTurn(hand,serialize(result.plan),{nexusCoreEnabled:true}).ok);
});
test('real PvP: phases, privacy, reconnect, immutability, two confirmations, reset/exclusions',async()=>{
  const f=serverFixture({core:true}),a=draft(f,1),b=draft(f,2);
  assert.equal((await f.call('submit-turn',1,{matchId:'fixture',round:1,...a})).status,409);
  await prepare(f,1,a);
  const me=(await f.call('get-state',1,{matchId:'fixture'})).body,op=(await f.call('get-state',2,{matchId:'fixture'})).body;
  assert.equal(me.me.hand.length,13);assert.equal(me.me.phase,'core_selected');assert.equal(me.me.preparation.coreCardId,a.coreCardId);
  assert.equal(op.opponent.core,undefined);assert.equal(op.opponent.preparation,undefined);assert.equal(op.latestRoundReport,null);
  const changed=structuredClone(a);[changed.placements[0].attack,changed.placements[0].defense]=[changed.placements[0].defense,changed.placements[0].attack];
  assert.equal((await f.call('prepare-core',1,{matchId:'fixture',round:1,placements:changed.placements,coreCardId:a.coreCardId})).status,409);
  assert.equal((await f.call('prepare-core',1,{matchId:'fixture',round:1,placements:a.placements,coreCardId:a.placements[0].attack[0]})).status,400);
  const body={matchId:'fixture',round:1,...a};assert.equal((await f.call('submit-turn',1,body)).status,200);
  assert.equal((await f.call('submit-turn',1,body)).status,200);assert.equal(f.reports.length,0);
  await prepare(f,2,b);
  const responses=await Promise.all([f.call('submit-turn',2,{matchId:'fixture',round:1,...b}),f.call('submit-turn',2,{matchId:'fixture',round:1,...b})]);
  assert.ok(responses.some(r=>r.status===200));assert.equal(f.reports.length,1);assert.equal(f.match.round,2);
  assert.ok(!f.match.state.hands[1].some(c=>c.id===a.coreCardId));assert.ok(!f.match.state.hands[2].some(c=>c.id===b.coreCardId));
  assert.deepEqual(f.match.state.corePreparations,{});
  const after=(await f.call('get-state',2,{matchId:'fixture'})).body;
  assert.equal(after.me.core,null);assert.equal(after.latestRoundReport.cores.a.cardId,a.coreCardId);
  const a2=draft(f,1),b2=draft(f,2);await prepare(f,1,a2);await prepare(f,2,b2);
  await f.call('submit-turn',1,{matchId:'fixture',round:2,...a2});await f.call('submit-turn',2,{matchId:'fixture',round:2,...b2});
  assert.equal(f.match.round,3);assert.deepEqual(f.match.state.coreExclusions,{1:[a2.coreCardId],2:[b2.coreCardId]});
  assert.ok(!f.match.state.coreExclusions[1].includes(a.coreCardId));
});
test('prepare rejects a previously excluded card even if a corrupted hand contains it',async()=>{
  const f=serverFixture({core:true}),t=draft(f,1);
  const body={matchId:'fixture',round:1,placements:t.placements};
  assert.equal((await f.call('prepare-core',1,{...body,power:100})).status,400);
  await f.call('prepare-core',1,body);f.match.state.coreExclusions={1:[t.coreCardId]};
  assert.equal((await f.call('prepare-core',1,{...body,coreCardId:t.coreCardId})).status,400);
});
test('real PvE core resolves without waiting for a bot selection',async()=>{
  const f=serverFixture({core:true});f.match.state.botMatch=true;
  const a=draft(f,1);await prepare(f,1,a);
  const result=await f.call('submit-turn',1,{matchId:'fixture',round:1,...a});
  assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.resolved,true);assert.equal(f.reports.length,1);
});
test('create/join/rematch preserve feature rules; legacy match stays legacy',async()=>{
  const f=serverFixture();
  assert.equal((await f.call('create-room',1,{nexusCoreEnabled:true})).status,200);
  assert.equal((await f.call('join-room',2,{roomCode:'TEST'})).status,200);
  assert.equal(f.match.state.rules.nexusCoreEnabled,true);assert.equal(f.match.state.hands[1].length,13);
  f.match.status='finished';f.match.state.botMatch=true;
  const rematch=await f.call('rematch',1,{matchId:'fixture'});assert.equal(rematch.status,200);assert.equal(rematch.body.waiting,false);
  assert.equal(f.createdMatches.at(-1).state.rules.nexusCoreEnabled,true);assert.equal(f.createdMatches.at(-1).state.hands[2].length,13);
  const old=serverFixture();assert.equal((await old.call('prepare-core',1,{matchId:'fixture',round:1,placements:[]})).status,409);
});
