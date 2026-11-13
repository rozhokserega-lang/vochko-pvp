import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,resolveRound,cloneGameState} from '../shared/engine.js';
import {choosePlan,planKey,evaluateState,botPlan} from '../shared/bot.js';
import {deal} from '../shared/cards.js';
import {mulberry32} from '../shared/rng.js';
import {C} from './helpers.js';
import {RECOMMENDED} from '../shared/abilities.js';

const pair = (s, r='A', r2='K') => [C(s,r),C(s,r2)];
const weak = pair('♠','2','3');
const turn = (attack=weak,defense=pair('♠','5','6')) => ({placements:[0,1,2].map(lane=>({lane,attack,defense}))});
const opts = extra => ({abilities:true,counters:false,rng:mulberry32(3),...extra});

test('audit: fire onHit retaliates on a fully blocked shield hit too',()=>{
  const s=createGameState(),a=turn(weak,pair('♥')),b=turn(weak,pair('♠'));
  const r=resolveRound(s,a,b,opts({variants:{fireRetaliation:'onHit'}}));
  assert.equal(r.abilityEvents.filter(e=>e.ability==='fire_retaliation').length,3);
});
test('audit: counter damage cannot redirect a simultaneous primary attack into the next tower',()=>{
  const s=createGameState(); s.a.outer.fill(1);
  resolveRound(s,turn(pair('♥')),turn(pair('♥'),[C('♥','A'),C('♠','K')]),opts());
  assert.deepEqual(s.a.outer,[0,0,0]);
  assert.deepEqual(s.a.inner,[18,18,18]);
});
test('audit: discharge and a primary hit cannot damage two buildings on the same lane',()=>{
  const s=createGameState(),a=turn(pair('♥')),b=turn(weak,weak);
  a.placements[0].attack=[C('♦','A'),C('♣','K')];
  resolveRound(s,a,b,opts({rng:()=>0}));
  assert.deepEqual(s.b.outer,[0,0,0]);assert.deepEqual(s.b.inner,[18,18,18]);
});
test('audit: partial-hit Steam cannot heal the next building after its target dies',()=>{
  const s=createGameState(),a=turn(weak,pair('♠')),b=turn(weak,pair('♠'));
  s.a.outer[1]=1;s.a.inner[1]=9;
  a.placements[1].defense=[C('♥','5'),C('♦','6')];
  b.placements[1].attack=[C('♠','5'),C('♣','10')];
  const r=resolveRound(s,a,b,opts({variants:{steamDampen:'healPartial'}}));
  assert.equal(r.report[1].b.info.hit,2);
  assert.equal(s.a.outer[1],0);assert.equal(s.a.inner[1],9);
  assert.ok(!r.abilityEvents.some(e=>e.ability==='steam_dampen'&&e.effect==='heal'&&e.amount>0));
});
test('audit: all water healing precedes burn ticks, independent of Nexus floor order',()=>{
  const run=burnLane=>{
    const s=createGameState();s.a.outer.fill(0);s.a.inner.fill(0);s.a.statuses[burnLane]={burn:2};
    const a=turn(weak,pair('♦'));a.placements[burnLane].defense=pair('♠');
    resolveRound(s,a,turn(weak,pair('♠')),opts({disabled:['earth_armor']}));return s.a.nexus;
  };
  assert.equal(run(0),78);assert.equal(run(2),78);
});
test('audit: water cleanse cancellation is reported exactly once per lane',()=>{
  const s=createGameState();
  const r=resolveRound(s,turn([C('♦','A'),C('♣','K')]),turn(weak,pair('♦')),opts({counters:true}));
  assert.equal(r.abilityEvents.filter(e=>e.canceled==='water_cleanse').length,3);
});
test('audit: candidate keys distinguish attack/defense role swaps',()=>{
  const a=turn(pair('♥'),pair('♠')),b=turn(pair('♠'),pair('♥'));
  assert.notEqual(planKey(a.placements),planKey(b.placements));
});
test('audit: evaluating a breached enemy line rewards opening it',()=>{
  const s=createGameState();s.b.inner[0]=0;
  assert.equal(evaluateState(s,'a'),18*.4+5);
  assert.equal(evaluateState(s,'b'),-(18*.4+5));
});
test('audit: A/B parameters and ablations apply only to their owner',()=>{
  const s=createGameState();s.a.outer.fill(8);s.b.outer.fill(8);
  resolveRound(s,turn(weak,pair('♦')),turn(weak,pair('♦')),opts({
    variantsBySide:{a:{waterCleanse:'heal1'},b:{}},disabledBySide:{b:['water_cleanse']},
  }));
  assert.deepEqual(s.a.outer,[9,9,9]);assert.deepEqual(s.b.outer,[8,8,8]);
});
test('audit: a cached legacy plan cannot be mutated by a caller',()=>{
  const s=createGameState(),h=deal(mulberry32(12));
  const expected=botPlan(h,s.b,s.a),copy=botPlan(h,s.b,s.a);copy[0].attack.reverse();copy[1].defense.pop();
  assert.deepEqual(botPlan(h,s.b,s.a),expected);
});
test('audit: hidden-hand getters are never read; fixed-work AI remains deterministic',()=>{
  const s=createGameState(),h=deal(mulberry32(12));
  Object.defineProperty(s,'hands',{get(){throw Error('hidden hands read');},enumerable:false});
  const run=()=>choosePlan({state:s,hand:h,rng:mulberry32(3),budgetMs:Infinity,depth:1,samples:2,layouts:2}).plan;
  assert.deepEqual(run(),run());assert.deepEqual(cloneGameState(s).a,s.a);
});
test('audit: randomized simultaneous combat is invariant under swapping players',()=>{
  for(const variants of [{},RECOMMENDED])for(let seed=1;seed<=20;seed++){
    const rng=mulberry32(seed),s=createGameState();
    for(const side of ['a','b'])for(let l=0;l<3;l++){
      s[side].outer[l]=Math.floor(rng()*13);s[side].inner[l]=Math.floor(rng()*19);
      s[side].statuses[l]={burn:Math.floor(rng()*3),armor:3,weakenAttack:15};
    }
    const tA={placements:botPlan(deal(rng),s.b,s.a)},tB={placements:botPlan(deal(rng),s.a,s.b)};
    const swapped={round:s.round,a:cloneGameState(s.b),b:cloneGameState(s.a)};
    resolveRound(s,tA,tB,opts({variants,counters:true,abilityRng:(side,l)=>mulberry32(seed*10+l+(side==='a'?100:200))}));
    resolveRound(swapped,tB,tA,opts({variants,counters:true,abilityRng:(side,l)=>mulberry32(seed*10+l+(side==='b'?100:200))}));
    assert.deepEqual(s.a,swapped.b);assert.deepEqual(s.b,swapped.a);
  }
});
