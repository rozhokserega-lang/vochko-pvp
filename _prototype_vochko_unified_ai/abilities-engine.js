import { pairStats } from './elements.js';
import { OUTER_HP, INNER_HP, NEXUS_HP, MAX_ROUNDS, shieldPct, damage, damageStage } from './engine.js';

export const ABILITY_VERSION = 'experimental-20-v1';
export function initialBoard() { return { nexus:NEXUS_HP,outer:[OUTER_HP,OUTER_HP,OUTER_HP],inner:[INNER_HP,INNER_HP,INNER_HP],statuses:[{},{},{}] }; }
export function initialMatch(){return {round:1,a:initialBoard(),b:initialBoard()};}
const round=Math.round;
const status=(p,l)=>p.statuses[l];
const active=(p,l)=>p.outer[l]>0?'outer':p.inner[l]>0?'inner':'nexus';
const hp=(p,l)=>p.outer[l]>0?p.outer[l]:p.inner[l]>0?p.inner[l]:p.nexus;
const heal=(p,l,n)=>{const k=active(p,l),cap={outer:OUTER_HP,inner:INNER_HP,nexus:NEXUS_HP}[k];if(k==='nexus')p.nexus=Math.min(cap,p.nexus+n);else p[k][l]=Math.min(cap,p[k][l]+n);};
const pstat=(cards,role)=>pairStats(cards)?.[role]??0;
const elem=(cards)=>pairStats(cards)?.element;
const get=(turn,l)=>turn.find(p=>p.lane===l);
const opponentCounter={fire:'water',water:'thunderstorm',earth:'lava',air:'sandstorm',steam:'ice',lava:'water',fire_vortex:'earth',ice:'fire',thunderstorm:'earth',sandstorm:'water'};
// Counter neutralizes only special ability; normal card damage remains unchanged.
const counter=(element,opposingElement)=>opponentCounter[element]===opposingElement;
const pending=(s,k)=>Number(s[k]||0);
export function resolveAbilitiesRound(state,turnA,turnB,{abilities=true,counters=true}={}){
  const before=structuredClone(state), reports=[];
  const lines=[0,1,2].map(l=>{const a=get(turnA,l),b=get(turnB,l);if(!a||!b)throw Error('Three full lanes required');return {a,b};});
  const hits=[[],[]],next=[[],[]],breach=[shieldPct(state.a),shieldPct(state.b)];
  const boards=[state.a,state.b];
  for(let l=0;l<3;l++){
    const {a,b}=lines[l];
    for(let side=0;side<2;side++){
      const own=boards[side],enemy=boards[1-side],mine=side?b:a,theirs=side?a:b;
      const atk=elem(mine.attack),def=elem(mine.defense),enemyAtk=elem(theirs.attack),enemyDef=elem(theirs.defense);
      const ownS=status(own,l),enemyS=status(enemy,l);
      const canAttack=!(counters&&counter(atk,enemyDef));
      const canDefend=!(counters&&counter(def,enemyAtk));
      let attack=pstat(mine.attack,'attack'),defense=pstat(theirs.defense,'defense');
      if(abilities)attack+=pending(ownS,'attackBoost');
      if(abilities){
        attack=round(attack*(1-pending(ownS,'weakenAttack')/100));
        defense=round(defense*(1-pending(enemyS,'weakenDefense')/100));
        if(enemyDef==='sandstorm'&&!(counters&&counter('sandstorm',atk)))defense+=4;
        if(enemyDef==='earth'&&!(counters&&counter('earth',atk)))defense+=pending(enemyS,'armor');
        if(atk==='water'&&canAttack)defense=Math.max(0,defense-Math.min(3,pending(enemyS,'armor')));
        if(atk==='earth'&&canAttack)defense-=round(Math.max(0,defense-pstat(theirs.defense,'defense'))*.15);
        if(atk==='lava'&&canAttack)defense=round(defense*.9);
        if(enemyDef==='steam'&&!(counters&&counter('steam',atk)))attack=round(attack*.9);
        if(enemyDef==='fire_vortex'&&!(counters&&counter('fire_vortex',atk))&&[l-1,l+1].some(x=>x>=0&&x<3&&pending(status(enemy,x),'burn')>0))attack=round(attack*.9);
      }
      const hit=Math.max(0,attack-Math.max(0,defense));
      hits[side][l]={hit,attack,defense,atk,def,enemyDef,canAttack,canDefend,enemyAtk};
      next[side][l]={};
    }
  }
  // Water cleanse is evaluated before scheduled burn; no side sees opponent hidden cards beyond the current reveal.
  if(abilities)for(let side=0;side<2;side++)for(let l=0;l<3;l++){
    const own=boards[side],mine=get(side?turnB:turnA,l),op=get(side?turnA:turnB,l);
    const clean=elem(mine.defense)==='water'&&!(counters&&counter('water',elem(op.attack)));
    if(clean){own.statuses[l]={};}else if(pending(status(own,l),'burn'))damage(own,l,pending(status(own,l),'burn'),breach[side]);
  }
  for(let side=0;side<2;side++)for(let l=0;l<3;l++){
    const own=boards[side],enemy=boards[1-side],h=hits[side][l],op=hits[1-side][l];
    const old=hp(enemy,l),stage=damageStage(enemy,l);
    damage(enemy,l,h.hit,breach[1-side]);
    reports.push({side:side?'b':'a',lane:l,attack:h.attack,defense:h.defense,hit:h.hit,stage,element:h.atk});
    if(!abilities)continue;
    const en=next[1-side][l],me=next[side][l];
    if(h.canAttack&&h.hit>0){
      if(h.atk==='fire')en.burn=Math.max(en.burn||0,2);
      if(h.atk==='lava')en.burn=Math.max(en.burn||0,1);
      if(h.atk==='air')en.weakenDefense=Math.max(en.weakenDefense||0,10);
      if(h.atk==='steam')en.weakenDefense=Math.max(en.weakenDefense||0,15);
      if(h.atk==='ice')en.weakenDefense=Math.max(en.weakenDefense||0,10);
      if(h.atk==='sandstorm')en.weakenAttack=Math.max(en.weakenAttack||0,15);
      if(h.atk==='fire_vortex')for(const j of [l-1,l+1])if(j>=0&&j<3){const n=next[1-side][j];n.burn=Math.max(n.burn||0,1);}
      if(h.atk==='thunderstorm'){
        const j=(l+1)%3;
        if(!(counters&&elem(get(side?turnA:turnB,j).defense)==='earth'))damage(enemy,j,2,breach[1-side]);
      }
    }
    if(h.canDefend){
      if(h.def==='earth')me.armor=3;
      if(h.def==='ice')en.weakenAttack=Math.max(en.weakenAttack||0,15);
      if(h.def==='thunderstorm'&&op.hit>0)me.attackBoost=2;
      if(h.def==='steam'&&op.hit===0)heal(own,l,2);
      if(h.def==='water'&&!Object.keys(status(own,l)).length)heal(own,l,2);
      if((h.def==='fire'||h.def==='air')&&op.hit===0)damage(enemy,l,2,breach[1-side]);
      if(h.def==='lava'&&op.hit>0)damage(enemy,l,2,breach[1-side]);
    }
  }
  if(abilities)for(let side=0;side<2;side++)for(let l=0;l<3;l++)boards[side].statuses[l]=next[side][l];
  state.round++;
  const deadA=state.a.nexus<=0,deadB=state.b.nexus<=0;
  const finished=deadA||deadB||state.round>MAX_ROUNDS;
  const winner=!finished?null:deadA&&deadB?'draw':deadB?'a':deadA?'b':state.a.nexus>state.b.nexus?'a':state.a.nexus<state.b.nexus?'b':'draw';
  return {finished,winner,reports,before};
}
