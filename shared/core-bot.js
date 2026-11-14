import {botPlan,evaluateState} from './bot.js';
import {pairStats} from './elements.js';
import {resolveRound,cloneGameState} from './engine.js';
import {dealCoreHand,coreTier} from './nexus-core.js';
import {mulberry32} from './rng.js';
import {deck,shuffled} from './cards.js';
import {sampleFutureDeck,exhaustionWinner} from './player-deck.js';

export function simpleCoreTurn(hand,own,enemy) {
  const placements=botPlan(hand,enemy,own),used=new Set(placements.flatMap(p=>[...p.attack,...p.defense].map(c=>c.id)));
  return {placements,coreCard:hand.find(c=>!used.has(c.id)),fortifyLane:null};
}
export function chooseCorePlan({state,hand,side='a',rng=Math.random,budgetMs=800,samples=2,variants={},counters=true,coreProfile='balanced',policy='adaptive',ownDeck=null,opponentBurned=[],opponentDeckCounts=null}={}) {
  if(hand?.length!==13)throw Error('Core AI requires 13 cards');
  // Sampled combat always uses the same viewer-relative orientation. A server
  // seat must not change the random future evaluated for an identical position.
  if(side==='b'){state={round:state.round,a:state.b,b:state.a};side='a';}
  const started=performance.now(),enemy=side==='a'?'b':'a';
  const samplesData=Array.from({length:samples},()=>{
    const available=shuffled(deck().filter(c=>!opponentBurned.includes(c.id)),rng),h=available.slice(0,13);
    const remaining=available.slice(13).map(c=>c.id),draw=opponentDeckCounts?.draw??remaining.length;
    const knowledge={remainingCards:remaining.slice(0,draw),discardPile:remaining.slice(draw),burnedCards:[...opponentBurned]};
    return {opponent:simpleCoreTurn(h,state[enemy],state[side]),hand:h,knowledge,seed:Math.floor(rng()*4294967296)};
  });
  let best=null,evaluated=0;
  const scores=[];
  // Reserve each card in turn, including high cards; pair optimization uses the
  // remaining twelve. This makes sacrificing an Ace an actual strategic choice.
  const fallbackCard=simpleCoreTurn(hand,state[side],state[enemy]).coreCard;
  let candidates=[fallbackCard,...[...hand].filter(c=>c.id!==fallbackCard.id).sort((a,b)=>coreTier(b)-coreTier(a))];
  if(policy==='highest')candidates=[[...hand].sort((a,b)=>coreTier(b)-coreTier(a)||b.v-a.v)[0]];
  if(policy==='lowest')candidates=[[...hand].sort((a,b)=>a.v-b.v)[0]];
  for(const card of candidates){
    if(best&&performance.now()-started>budgetMs)break;
    const plan={placements:botPlan(hand.filter(c=>c.id!==card.id),state[enemy],state[side]),coreCard:card,fortifyLane:null};
    let score=0;
    for(const sample of samplesData){
      const sim=cloneGameState(state);let forecastRound=0;
      const resolve=(own,opp)=>{
        const rollSeed=(sample.seed^Math.imul(++forecastRound,0x9e3779b9))>>>0;
        const options={abilities:true,counters,variants,rng:mulberry32(rollSeed),nexusCoreEnabled:true,coreProfile,
          abilityRng:(attacker,lane)=>mulberry32((rollSeed^Math.imul(lane+1,0x85ebca6b)^(attacker==='a'?0x12345678:0x87654321))>>>0)};
        return side==='a'?resolveRound(sim,own,opp,options):resolveRound(sim,opp,own,options);
      };
      let result=resolve(plan,sample.opponent);
      if(!result.finished){
        // Randomize unknown order; never inspect the server's future draw order
        // or the opponent's hidden hand. Permanent burns remain excluded.
        const ownNext=ownDeck?sampleFutureDeck(ownDeck,hand,plan,mulberry32(sample.seed^0x45d9f3b)):{hand:dealCoreHand(mulberry32(sample.seed^0x45d9f3b),[card.id])};
        const enemyNext=ownDeck?sampleFutureDeck(sample.knowledge,sample.hand,sample.opponent,mulberry32(sample.seed^0x27d4eb2d)):{hand:dealCoreHand(mulberry32(sample.seed^0x27d4eb2d),[sample.opponent.coreCard.id])};
        if(ownNext.exhausted||enemyNext.exhausted)result={finished:true,winner:exhaustionWinner(sim)};
        else result=resolve(simpleCoreTurn(ownNext.hand,sim[side],sim[enemy]),simpleCoreTurn(enemyNext.hand,sim[enemy],sim[side]));
      }
      score+=result.finished?(result.winner==='draw'?0:result.winner===side?10000:-10000):evaluateState(sim,side);
    }
    evaluated++;
    // Small future-deck cost breaks otherwise equal sacrifices; it never
    // overrides a material change in the simulated battle.
    const physicalPower=plan.placements.reduce((sum,p)=>sum+pairStats(p.attack).attack+pairStats(p.defense).defense,0);
    score=score/samplesData.length+physicalPower*.25-card.v*.001;
    scores.push({id:card.id,rank:card.r,score});
    if(!best||score>best.score)best={plan,score};
  }
  return {...best,stats:{ms:performance.now()-started,candidates:13,evaluated,samples,depth:2,scores}};
}
