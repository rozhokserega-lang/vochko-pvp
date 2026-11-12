import {pairStats} from './elements.js';
import {deal} from './cards.js';
import {resolveAbilitiesRound} from './abilities-engine.js';
const hp=b=>b.nexus+ b.outer.reduce((a,x)=>a+x,0)+b.inner.reduce((a,x)=>a+x,0);
const progress=b=>[0,1,2].reduce((a,l)=>a+(b.outer[l]===0?6:0)+(b.inner[l]===0?18:0),0);
const value=(s,side)=>{const me=s[side],enemy=s[side==='a'?'b':'a'];return (hp(me)-hp(enemy))*.3+(progress(enemy)-progress(me))*1.5+(me.nexus-enemy.nexus)*2;};
const choose=(arr,rng)=>arr[Math.floor(rng()*arr.length)];
export function candidate(hand,board,enemy,rng=Math.random,mode='aware'){
 const used=new Set(),pairs=[];
 const preference=(pair,role,l)=>{const st=pairStats(pair),x=st[role];if(mode==='power')return x;const target=role==='attack'?enemy:board;const current=target.outer[l]>0?target.outer[l]:target.inner[l]>0?target.inner[l]:target.nexus;
 const statuses=target.statuses?.[l]||{};let bonus=0;
 if(role==='attack'){
   if(st.element==='water')bonus+=Math.min(3,statuses.armor||0)*1.8;
   if(st.element==='steam'||st.element==='ice'||st.element==='air')bonus+=current>8?3:1;
   if(st.element==='fire'||st.element==='lava')bonus+=current>2?3:0;
   if(st.element==='thunderstorm')bonus+=4;
   if(st.element==='fire_vortex')bonus+=4;
   if(x>=current&&current>0)bonus+=6;
 }else{
   if(st.element==='water')bonus+=Object.keys(statuses).length?8:2;
   if(st.element==='earth')bonus+=4;
   if(st.element==='ice'||st.element==='sandstorm')bonus+=4;
   if(st.element==='steam')bonus+=2;
   if(current<=8)bonus+=4;
 }
 return x+bonus;
 };
 const slots=Array.from({length:3},(_,l)=>({role:'attack',l})).concat(Array.from({length:3},(_,l)=>({role:'defense',l})));
 slots.sort(()=>rng()-.5);
 for(const {role,l} of slots){let best=null;for(let i=0;i<hand.length;i++)if(!used.has(i))for(let j=i+1;j<hand.length;j++)if(!used.has(j)){
 const pair=[hand[i],hand[j]],score=preference(pair,role,l)+rng()*12;
 if(!best||score>best.score)best={i,j,pair,score};}
 used.add(best.i);used.add(best.j);pairs.push({role,l,pair:best.pair});}
 return [0,1,2].map(l=>({lane:l,attack:pairs.find(p=>p.l===l&&p.role==='attack').pair,defense:pairs.find(p=>p.l===l&&p.role==='defense').pair}));
}
// Deterministic RNG for reproducible paired trials.
export function seeded(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
export function choosePlan({state,hand,side='a',rng=Math.random,candidates=12,samples=6,mode='aware'}){
 const own=state[side],enemy=state[side==='a'?'b':'a'];let best=null;
 const opponents=Array.from({length:samples},()=>{const h=deal(rng);return candidate(h,enemy,own,rng,'aware');});
 for(let i=0;i<candidates;i++){
   const plan=candidate(hand,own,enemy,rng,mode);
   let score=0;
   for(const op of opponents){const sim=structuredClone(state);const first=resolveAbilitiesRound(sim,...(side==='a'?[plan,op]:[op,plan]));
     if(!first.finished){const h1=deal(rng),h2=deal(rng);const p1=candidate(h1,sim.a,sim.b,rng,'aware');const p2=candidate(h2,sim.b,sim.a,rng,'aware');resolveAbilitiesRound(sim,p1,p2);}
     score+=value(sim,side);}
   score/=samples;
   if(!best||score>best.score)best={plan,score};
 }
 return best;
}
