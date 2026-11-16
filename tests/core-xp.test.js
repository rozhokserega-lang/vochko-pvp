import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deck} from '../shared/cards.js';
import {newBoard,createGameState,resolveRound,damage,healStructure} from '../shared/engine.js';
import {cardXp,coreProgress,coreBonuses,addCoreXp,absorbCoreCard,publicBoard,nexusMaxHp} from '../shared/core-progression.js';
import {serverFixture} from './server-fixture.mjs';
import {chooseCorePlan} from '../shared/core-bot.js';
import {mulberry32} from '../shared/rng.js';
const physical=deck();
const turn=hand=>({placements:[0,1,2].map(lane=>({lane,attack:hand.slice(lane*4,lane*4+2),defense:hand.slice(lane*4+2,lane*4+4)})),coreCard:hand[12]});
const wire=t=>({placements:t.placements.map(p=>({lane:p.lane,attack:p.attack.map(c=>c.id),defense:p.defense.map(c=>c.id)})),coreCardId:t.coreCard.id,fortifyLane:null});
const setup=()=>{const f=serverFixture({core:true,persistent:true});f.match.state.rules.coreVersion=2;return f;};
async function seal(f,seat){const t=wire(turn(f.match.state.hands[seat])),body={matchId:'fixture',round:f.match.round,placements:t.placements};assert.equal((await f.call('prepare-core',seat,body)).status,200);const r=await f.call('prepare-core',seat,{...body,coreCardId:t.coreCardId});assert.equal(r.status,200,JSON.stringify(r));return {t,r,body};}
test('XP: all 52 ranks are suit independent, thresholds and cumulative bonuses',()=>{
 for(const c of physical)assert.equal(cardXp(c),({'J':11,Q:12,K:13,A:14})[c.r]??Number(c.r));
 for(const xp of [0,19,20,39,40,59,60,79,80,99,100,120]){const b=newBoard();addCoreXp(b,xp);const level=Math.min(5,Math.floor(xp/20));assert.deepEqual(coreProgress(b),{xp:Math.min(100,xp),level});assert.deepEqual(coreBonuses(b),{hp:(level>=1?5:0)+(level>=5?10:0),attack:(level>=2?1:0)+(level>=4?1:0),shield:level>=3?3:0});}
 assert.throws(()=>cardXp({r:'forged'}));
});
test('XP: multi-level card award caps, heals by max HP delta only and cannot resurrect',()=>{
 const b=newBoard();b.nexus=30;addCoreXp(b,19);absorbCoreCard(b,{r:'A'},1);assert.equal(b.nexus,35);assert.equal(nexusMaxHp(b),85);addCoreXp(b,99);assert.equal(b.nexus,45);assert.equal(nexusMaxHp(b),95);assert.equal(healStructure({...b,outer:[0,0,0],inner:[0,0,0]},0,100),50);assert.equal(addCoreXp(b,14).xp,100);assert.equal(b.nexus,45);
 const dead=newBoard();dead.nexus=0;addCoreXp(dead,100);assert.equal(dead.nexus,0);assert.equal(nexusMaxHp(dead),95);
});
test('XP: round absorption is idempotent; stale attempts cannot change state',()=>{
 const b=newBoard();absorbCoreCard(b,{r:'A'},2);const saved=structuredClone(b);absorbCoreCard(b,{r:'A'},2);assert.deepEqual(b,saved);assert.throws(()=>absorbCoreCard(b,{r:'A'},1));assert.deepEqual(b,saved);
});
test('XP: shield absorbs before breach multiplier, never protects towers',()=>{
 const b=newBoard();addCoreXp(b,60);damage(b,0,10);assert.equal(b.outer[0],2);b.outer.fill(0);b.inner.fill(0);b.inner[1]=18;b.inner[2]=18;const hp=b.nexus;damage(b,0,10);assert.equal(b.nexus,hp-3);damage(b,0,2);assert.equal(b.nexus,hp-3);
});
test('XP: attack bonus is once per pair and legacy elemental Core is disabled',()=>{
 const hand=physical.slice(0,13),a=turn(hand),b=turn([...physical].reverse().slice(0,13));
 for(const abilities of [false,true]){const initial=createGameState();addCoreXp(initial.a,40);const base=structuredClone(initial),xp=structuredClone(initial);const old=resolveRound(base,a,b,{abilities,nexusCoreEnabled:false});const result=resolveRound(xp,a,b,{abilities,nexusCoreEnabled:true,coreVersion:2,counters:true});assert.equal(result.report[0].a.info.a,old.report[0].a.info.a+1);assert.equal(result.coreEffects,undefined);}
});
test('XP server: concurrent prepare, replay, rejection and restored DTO are authoritative',async()=>{
 const f=setup(),{r,body,t}=await seal(f,1),xp=cardXp(f.match.state.hands[1].find(c=>c.id===t.coreCardId));assert.equal(r.body.coreProgress.xp,xp);
 const rs=await Promise.all([f.call('prepare-core',1,{...body,coreCardId:t.coreCardId}),f.call('prepare-core',1,{...body,coreCardId:t.coreCardId})]);assert.ok(rs.every(r=>r.status===200));assert.equal(f.match.state.board.a.coreProgress.xp,xp);
 assert.equal((await f.call('prepare-core',1,{...body,coreCardId:t.coreCardId,xp:100})).status,400);
 assert.equal((await f.call('prepare-core',1,{...body,coreCardId:t.placements[0].attack[0]})).status,400);
 const dto=(await f.call('get-state',1,{matchId:'fixture'})).body,enemy=(await f.call('get-state',2,{matchId:'fixture'})).body;
 assert.equal(dto.me.coreProgress.xp,xp);assert.equal(dto.board.me.coreProgress,undefined);assert.equal(enemy.board.opponent.coreProgress,undefined);assert.equal(enemy.opponent.coreProgress,undefined);assert.equal(dto.me.core,null);assert.deepEqual((await f.call('get-state',1,{matchId:'fixture'})).body,dto);
});
test('XP server: PvP resolves both turns once, hides sacrifices in report and consumes 13 cards',async()=>{
 const f=setup(),a=await seal(f,1),b=await seal(f,2),xp=f.match.state.board.a.coreProgress.xp;
 const body={matchId:'fixture',round:1,...a.t};assert.equal((await f.call('submit-turn',1,body)).status,200);assert.equal((await f.call('submit-turn',1,body)).status,200);
 assert.equal((await f.call('submit-turn',2,{matchId:'fixture',round:1,...b.t})).status,200);assert.equal(f.match.state.board.a.coreProgress.xp,xp);assert.equal(f.match.state.hands[1].length,13);assert.equal(f.match.state.decks[1].burnedCards.length,1);assert.equal(f.reports[0].public_result.cores,undefined);assert.equal(f.reports[0].public_result.coreEffects,undefined);
 assert.equal((await f.call('prepare-core',1,{...a.body,coreCardId:a.t.coreCardId})).status,409);
});
test('XP server: bot receives same engine progression without double-awarding player',async()=>{
 const f=setup();f.match.state.botMatch=true;const a=await seal(f,1),xp=f.match.state.board.a.coreProgress.xp;const r=await f.call('submit-turn',1,{matchId:'fixture',round:1,...a.t});assert.equal(r.status,200,JSON.stringify(r));assert.equal(f.match.state.board.a.coreProgress.xp,xp);assert.ok(f.match.state.board.b.coreProgress.xp>=2);assert.equal(f.reports.length,1);
});
test('XP server: new rooms and rematches enable v2 with zero progression',async()=>{
 const f=serverFixture();let r=await f.call('create-room',1,{vsBot:true,nexusCoreEnabled:true});assert.equal(r.status,200);assert.equal(f.match.state.rules.coreVersion,2);assert.equal(coreProgress(f.match.state.board.a).xp,0);
 f.match.status='finished';f.match.state.botMatch=true;r=await f.call('rematch',1,{matchId:'fixture'});assert.equal(r.status,200);assert.equal(f.createdMatches.at(-1).state.rules.coreVersion,2);assert.equal(coreProgress(f.createdMatches.at(-1).state.board.a).xp,0);
});
test('XP AI: changing hidden opponent XP and sacrificed card identities cannot change decision',()=>{
 const f=setup(),state={round:1,...f.match.state.board},hand=f.match.state.hands[1],opts={state,hand,coreVersion:2,samples:1,budgetMs:10000,policy:'highest'};
 const a=chooseCorePlan({...opts,rng:mulberry32(8)});state.b.coreProgress={xp:99,level:4};state.b.coreAppliedRound=1;
 const b=chooseCorePlan({...opts,opponentBurned:['♥A'],rng:mulberry32(8)});assert.deepEqual(a.plan,b.plan);assert.equal(a.score,b.score);assert.equal(publicBoard(state.b).coreProgress,undefined);
});
