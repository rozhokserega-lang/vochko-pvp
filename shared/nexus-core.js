import { ELEMENTS } from './elements.js';
import { deck, shuffled } from './cards.js';

export const CORE_VERSION = 1;
export const CORE_SUITS = Object.freeze({ '♥':{name:'Огонь',icon:'🔥',color:'#ff7548'},'♦':{name:'Вода',icon:'💧',color:'#66dfff'},'♠':{name:'Земля',icon:'◆',color:'#dcb27b'},'♣':{name:'Воздух',icon:'≋',color:'#bceaff'} });
export const CORE_TIERS = ['I','II','III','IV'];
const units=[1,2,3,4],heavy=[2,3,4,5],percent=[2,4,6,8],strongPercent=[5,10,15,20];
// Additive, ability-specific bonuses; none modifies pairStats/combo multipliers.
export const CORE_ABILITIES = Object.freeze({
  fire_burn:{element:'fire',burn:units},fire_retaliation:{element:'fire',damage:units},
  water_strip_armor:{element:'water',strip:units},water_cleanse:{element:'water',heal:units},
  earth_pierce_def:{element:'earth',percent},earth_armor:{element:'earth',armor:units},
  air_weaken_def:{element:'air',percent},air_reflect:{element:'air',damage:units},
  steam_weaken_def:{element:'steam',percent},steam_dampen:{element:'steam',percent,heal:units},
  lava_pierce_burn:{element:'lava',percent,burn:units},lava_counter:{element:'lava',damage:units},
  fire_vortex_spread:{element:'fire_vortex',burn:units},fire_vortex_zaslon:{element:'fire_vortex',percent},
  ice_weaken_def:{element:'ice',percent},ice_weaken_atk:{element:'ice',percent},
  thunderstorm_discharge:{element:'thunderstorm',damage:units},thunderstorm_charge:{element:'thunderstorm',charge:units},
  sandstorm_weaken_atk:{element:'sandstorm',percent},sandstorm_shield:{element:'sandstorm',shield:units},
});
export const coreTier = card => card?.r==='A'?4:['J','Q','K'].includes(card?.r)?3:Number(card?.r)>=7?2:Number(card?.r)>=2?1:0;
export const coreElements = suit => Object.values(ELEMENTS).filter(e=>e.suits.includes(suit));
export function coreDescriptor(card) {
  if(!card||!deck().some(c=>c.id===card.id&&c.s===card.s&&c.r===card.r))return null;
  return {cardId:card.id,suit:card.s,rank:card.r,tier:coreTier(card),...CORE_SUITS[card.s],elements:coreElements(card.s).map(e=>e.id)};
}
export function coreAbilityBonus(ctx,side,id,key) {
  if(ctx.coreDisabled?.includes(id))return 0;
  const card=ctx.cores?.[side],tier=coreTier(card),ability=CORE_ABILITIES[id];
  if(!tier||!ability||!ELEMENTS[ability.element].suits.includes(card.s))return 0;
  const baseline=ability[key];if(!baseline)return 0;
  const values=ctx.coreProfile==='base' ? (key==='percent'?strongPercent:['heal','armor','shield'].includes(key)?heavy:baseline) : baseline;
  return values[tier-1];
}
export function dealCoreHand(rng=Math.random,excluded=[]) {
  const banned=new Set(excluded);
  if(banned.size>1||[...banned].some(id=>!deck().some(c=>c.id===id)))throw Error('Invalid one-deal exclusion');
  return shuffled(deck(),rng).filter(c=>!banned.has(c.id)).slice(0,13);
}
export function nextCoreHands(seed,cores) {
  // The caller owns the RNG; exclusions are replaced each round, never stacked.
  return {1:dealCoreHand(seed,cores.a?[cores.a.id]:[]),2:dealCoreHand(seed,cores.b?[cores.b.id]:[])};
}
