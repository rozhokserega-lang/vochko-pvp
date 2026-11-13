import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeckMatch,createPlayerDeck,drawDeckHand,settleDeckHand,validatePlayerDeck,deckKnowledge,sampleFutureDeck,exhaustionWinner} from '../shared/player-deck.js';
import {mulberry32} from '../shared/rng.js';
import {serverFixture} from './server-fixture.mjs';
import {chooseCorePlan} from '../shared/core-bot.js';
import {resolveRound,createGameState} from '../shared/engine.js';
import {ELEMENTS} from '../shared/elements.js';
import {C} from './helpers.js';
const turn=hand=>({placements:[0,1,2].map(lane=>({lane,attack:hand.slice(lane*4,lane*4+2),defense:hand.slice(lane*4+2,lane*4+4)})),coreCard:hand[12]});
const wire=t=>({placements:t.placements.map(p=>({lane:p.lane,attack:p.attack.map(c=>c.id),defense:p.defense.map(c=>c.id)})),coreCardId:t.coreCard.id,fortifyLane:null});
const seal=async(f,seat,t)=>{
  const body={matchId:'fixture',round:f.match.round,placements:t.placements};
  assert.equal((await f.call('prepare-core',seat,body)).status,200);
  assert.equal((await f.call('prepare-core',seat,{...body,coreCardId:t.coreCardId})).status,200);
};
test('persistent deck: first six rounds match the specification, four hands exhaust exactly 52 distinct cards',()=>{
  const rng=mulberry32(29);let zones=createPlayerDeck(rng);const firstFour=[];
  for(let round=1;round<=6;round++){
    const before=structuredClone(zones),drawn=drawDeckHand(zones,rng);zones=drawn.deck;
    assert.equal(drawn.hand.length,13);assert.equal(new Set(drawn.hand.map(c=>c.id)).size,13);
    assert.ok(drawn.hand.every(c=>!before.burnedCards.includes(c.id)));
    if(round<=4)firstFour.push(...drawn.hand.map(c=>c.id));
    if(round===5){assert.equal(before.discardPile.length,48);assert.equal(zones.drawPile.length,35);}
    if(round===6)assert.equal(zones.drawPile.length,22);
    zones=settleDeckHand(zones,drawn.hand,turn(drawn.hand));assert.equal(zones.burnedCards.length,round);
  }
  assert.equal(new Set(firstFour).size,52);
});
test('remainder is drawn before reshuffle, and sufficient draw pile never touches discard',()=>{
  const rng=mulberry32(91);let {decks,hands}=createDeckMatch(rng),zones=decks[1],hand=hands[1];
  for(let round=1;round<=9;round++){
    zones=settleDeckHand(zones,hand,turn(hand));const before=structuredClone(zones);
    const result=drawDeckHand(zones,()=>{assert.ok(before.drawPile.length<13,'unnecessary shuffle');return rng();});
    assert.deepEqual(result.hand.slice(0,Math.min(13,before.drawPile.length)).map(c=>c.id),before.drawPile.slice(0,13));
    if(before.drawPile.length>=13)assert.deepEqual(result.deck.discardPile,before.discardPile);
    assert.equal(new Set(result.hand.map(c=>c.id)).size,13);zones=result.deck;hand=result.hand;
  }
});
test('100 complete deck lifecycles conserve all 52 physical cards; every burned card stays destroyed; exhaustion is atomic',()=>{
  for(let seed=0;seed<100;seed++){
    const rng=mulberry32(seed);let zones=createPlayerDeck(rng);
    for(let round=1;round<=40;round++){
      const {deck,hand,exhausted}=drawDeckHand(zones,rng);assert.equal(exhausted,false);
      assert.ok(hand.every(c=>!zones.burnedCards.includes(c.id)));validatePlayerDeck(deck,hand);
      zones=settleDeckHand(deck,hand,turn(hand));validatePlayerDeck(zones);
    }
    const before=structuredClone(zones),result=drawDeckHand(zones,rng);
    assert.equal(result.exhausted,true);assert.deepEqual(result.hand,[]);assert.deepEqual(result.deck,before);assert.deepEqual(zones,before);
  }
});
test('deck integrity rejects duplicate zones, unknown cards and reuse of burned/current cards',()=>{
  const initial=createDeckMatch(mulberry32(1)),zones=initial.decks[1],hand=initial.hands[1];
  assert.throws(()=>validatePlayerDeck({...zones,discardPile:[hand[0].id]},hand));
  assert.throws(()=>settleDeckHand(zones,hand,{...turn(hand),coreCard:hand[0]}));
  const forged=structuredClone(zones);forged.drawPile[0]='forged';assert.throws(()=>validatePlayerDeck(forged,hand));
});
test('AI forecasts use unordered own deck and permanently exclude burns; seeded decisions are reproducible',()=>{
  const rng=mulberry32(8),initial=createDeckMatch(rng);let zones=settleDeckHand(initial.decks[1],initial.hands[1],turn(initial.hands[1]));
  const current=drawDeckHand(zones,rng),knowledge=deckKnowledge(current.deck),plan=turn(current.hand);
  assert.deepEqual(knowledge.remainingCards,[...knowledge.remainingCards].sort());
  const future=sampleFutureDeck(knowledge,current.hand,plan,mulberry32(1));
  assert.ok(future.hand.every(c=>![...knowledge.burnedCards,plan.coreCard.id].includes(c.id)));
  const f=serverFixture({core:true,persistent:true}),opts={state:{round:1,...f.match.state.board},hand:f.match.state.hands[1],ownDeck:deckKnowledge(f.match.state.decks[1]),budgetMs:10000,samples:1,policy:'highest'};
  const a=chooseCorePlan({...opts,rng:mulberry32(9)}),b=chooseCorePlan({...opts,rng:mulberry32(9)});assert.deepEqual(a.plan,b.plan);assert.equal(a.score,b.score);
});
test('server deck v2 persists across rounds/reconnects, hides future order and opponent zones, replay does not burn twice',async()=>{
  const f=serverFixture({core:true,persistent:true});const first=f.match.state.hands[1].map(c=>c.id);
  for(let round=1;round<=6;round++){
    // Keep structures alive to exercise multiple reshuffles independently of combat balance.
    for(const board of Object.values(f.match.state.board)){board.outer.fill(10000);board.statuses=[{},{},{}];}
    const turns=[1,2].map(seat=>wire(turn(f.match.state.hands[seat])));
    for(const seat of [1,2])await seal(f,seat,turns[seat-1]);
    const payload={matchId:'fixture',round,...turns[0]};
    assert.equal((await f.call('submit-turn',1,payload)).status,200);
    const saved=structuredClone(f.match.state.decks);assert.equal((await f.call('submit-turn',1,payload)).status,200);assert.deepEqual(f.match.state.decks,saved);
    assert.equal((await f.call('submit-turn',2,{matchId:'fixture',round,...turns[1]})).status,200);
    assert.equal(f.match.state.decks[1].burnedCards.length,round);
    const dto=(await f.call('get-state',1,{matchId:'fixture'})).body,again=(await f.call('get-state',1,{matchId:'fixture'})).body;
    assert.deepEqual(dto.me.hand,again.me.hand);assert.equal(dto.me.deck.burnedCards.length,round);
    assert.equal(dto.me.deck.drawPile,undefined);assert.equal(dto.opponent.deck,undefined);assert.equal(dto.opponent.hand,undefined);
    if(round<4)assert.ok(dto.me.hand.every(c=>!first.includes(c.id)));
  }
});
test('server finishes round 40 by Nexus HP on exhaustion, with correct final report and no partial hand',async()=>{
  for(const [a,b,winner]of [[80,70,'me'],[60,70,'opponent'],[70,70,'draw']]){
    const f=serverFixture({core:true,persistent:true});
    // Advance cards only to the last legal hand (39 permanent burns).
    for(let i=0;i<39;i++)for(const seat of [1,2]){
      const st=f.match.state,zones=settleDeckHand(st.decks[seat],st.hands[seat],turn(st.hands[seat])),next=drawDeckHand(zones,mulberry32(i));st.decks[seat]=next.deck;st.hands[seat]=next.hand;
    }
    f.match.round=40;f.match.state.rules.abilities=false;
    f.match.state.board.a.nexus=a;f.match.state.board.b.nexus=b;
    for(const board of Object.values(f.match.state.board))board.outer.fill(10000);
    for(const seat of [1,2]){
      const t=wire(turn(f.match.state.hands[seat]));await seal(f,seat,t);
      assert.equal((await f.call('submit-turn',seat,{matchId:'fixture',round:40,...t})).status,200);
    }
    const dto=(await f.call('get-state',1,{matchId:'fixture'})).body;
    assert.equal(dto.status,'finished');assert.equal(dto.round,40);assert.equal(dto.endReason,'deck_exhaustion');assert.equal(dto.winner,winner);
    assert.equal(dto.me.hand.length,0);assert.ok(dto.latestRoundReport);validatePlayerDeck(f.match.state.decks[1]);
  }
  assert.equal(exhaustionWinner({a:{nexus:1},b:{nexus:1}}),'draw');
});
test('persistent PvE uses both independent server decks',async()=>{
  const f=serverFixture({core:true,persistent:true});f.match.state.botMatch=true;
  const t=wire(turn(f.match.state.hands[1]));await seal(f,1,t);
  const result=await f.call('submit-turn',1,{matchId:'fixture',round:1,...t});
  assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.resolved,true);
  for(const seat of [1,2]){assert.equal(f.match.state.decks[seat].burnedCards.length,1);validatePlayerDeck(f.match.state.decks[seat],f.match.state.hands[seat]);}
});
test('Core effect report contains only triggered matching bonuses with the correct side and lane',()=>{
  const pair=id=>[...ELEMENTS[id].suits].map((s,i)=>C(s,i?'K':'A'));
  const make=(atk,def,suit)=>({coreCard:C(suit,'A'),placements:[0,1,2].map(lane=>({lane,attack:pair(atk),defense:pair(def)}))});
  const a=make('earth','earth','♠'),b=make('earth','earth','♥');
  const result=resolveRound(createGameState(),a,b,{abilities:true,counters:true,nexusCoreEnabled:true,rng:()=>0});
  assert.ok(result.coreEffects.length);assert.ok(result.coreEffects.every(e=>e.side==='a'&&e.ability.startsWith('earth_')));
  assert.deepEqual([...new Set(result.coreEffects.map(e=>e.lane))].sort(),[0,1,2]);
  const countered=resolveRound(createGameState(),make('fire','earth','♥'),make('earth','water','♦'),{abilities:true,counters:true,nexusCoreEnabled:true,rng:()=>0});
  assert.ok(!countered.coreEffects.some(e=>e.ability==='fire_burn'),'countered bonuses must not appear');
});
