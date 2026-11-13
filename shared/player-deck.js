import {deck,shuffled} from './cards.js';
const cards=deck(),byId=new Map(cards.map(c=>[c.id,c]));
export const DECK_VERSION=2;
export function validatePlayerDeck(zones,hand=[]){
  const ids=[];
  for(const name of ['drawPile','discardPile','burnedCards']){
    if(!Array.isArray(zones?.[name]))throw Error(`Missing deck zone: ${name}`);
    ids.push(...zones[name]);
  }
  ids.push(...hand.map(c=>typeof c==='string'?c:c.id));
  if(ids.length!==52||new Set(ids).size!==52||ids.some(id=>!byId.has(id)))throw Error('Deck zones must partition 52 unique physical cards');
  return true;
}
export function createPlayerDeck(rng=Math.random){return {drawPile:shuffled(cards.map(c=>c.id),rng),discardPile:[],burnedCards:[]};}
export function drawDeckHand(zones,rng=Math.random){
  validatePlayerDeck(zones);
  const next=structuredClone(zones);
  if(next.drawPile.length+next.discardPile.length<13)return {deck:next,hand:[],exhausted:true};
  const hand=[];
  while(hand.length<13){
    if(!next.drawPile.length){next.drawPile=shuffled(next.discardPile,rng);next.discardPile=[];}
    hand.push(...next.drawPile.splice(0,Math.min(13-hand.length,next.drawPile.length)));
  }
  const result=hand.map(id=>({...byId.get(id)}));validatePlayerDeck(next,result);
  return {deck:next,hand:result,exhausted:false};
}
export function settleDeckHand(zones,hand,turn){
  validatePlayerDeck(zones,hand);
  const played=turn.placements.flatMap(p=>[...p.attack,...p.defense].map(c=>c.id));
  const burn=turn.coreCard?.id,owned=new Set(hand.map(c=>c.id)),used=[...played,burn];
  if(hand.length!==13||played.length!==12||new Set(used).size!==13||used.some(id=>!owned.has(id)))throw Error('Exactly twelve played cards and one owned core card required');
  const result={drawPile:[...zones.drawPile],discardPile:[...zones.discardPile,...played],burnedCards:[...zones.burnedCards,burn]};
  validatePlayerDeck(result);return result;
}
export function createDeckMatch(rng=Math.random){
  const a=drawDeckHand(createPlayerDeck(rng),rng),b=drawDeckHand(createPlayerDeck(rng),rng);
  return {decks:{1:a.deck,2:b.deck},hands:{1:a.hand,2:b.hand}};
}
export const deckKnowledge=zones=>({remainingCards:[...zones.drawPile].sort(),discardPile:[...zones.discardPile],burnedCards:[...zones.burnedCards]});
export function sampleFutureDeck(knowledge,hand,turn,rng){
  const zones={drawPile:shuffled(knowledge.remainingCards,rng),discardPile:[...knowledge.discardPile],burnedCards:[...knowledge.burnedCards]};
  return drawDeckHand(settleDeckHand(zones,hand,turn),rng);
}
export const exhaustionWinner=state=>state.a.nexus>state.b.nexus?'a':state.a.nexus<state.b.nexus?'b':'draw';
