import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {deal} from '../shared/cards.js';
import {dealCoreHand,coreDescriptor} from '../shared/nexus-core.js';
import {chooseCorePlan} from '../shared/core-bot.js';
import {choosePlan} from '../shared/bot.js';
import {createGameState,cloneGameState,resolveRound} from '../shared/engine.js';
import {ABILITIES,RECOMMENDED} from '../shared/abilities.js';
import {elementOf,ELEMENTS} from '../shared/elements.js';
import {mulberry32} from '../shared/rng.js';
const seedFor=(pair,round,channel)=>{let h=(20261113^Math.imul(pair+1,0x9e3779b9)^Math.imul(round+1,0x85ebca6b))>>>0;for(const c of channel)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h;};
const add=(map,key,n=1)=>{map[key]=(map[key]??0)+n;};
const damage=result=>result.events.filter(e=>!e.heal).reduce((s,e)=>s+e.amount,0);
const heal=result=>result.events.filter(e=>e.heal).reduce((s,e)=>s+e.amount,0);
function play(config,pair,mirror){
  const state=createGameState(),identity=mirror?{a:'B',b:'A'}:{a:'A',b:'B'},banned={A:[],B:[]};
  const m={suits:{},ranks:{},usage:{},elements:{},aceAvailable:0,aceSelected:0,twoAvailable:0,twoSelected:0,
    boostedOpportunities:0,boostedBlocked:0,extraDamage:0,extraHeal:0,extraArmor:0,queuedBurn:0,exclusionDisplacements:0,deals:0,decisionMs:[]};
  let result;
  for(let round=0;round<45;round++){
    const turns={};
    for(const side of ['a','b']){
      const id=identity[side],rng=mulberry32(seedFor(pair,round,`deal-${id}`));
      const hand=config.core?dealCoreHand(rng,banned[id]):deal(rng);
      if(config.core){const free=dealCoreHand(mulberry32(seedFor(pair,round,`deal-${id}`)));m.exclusionDisplacements+=free.some(c=>banned[id].includes(c.id))?1:0;m.deals++;}
      const start=performance.now(),random=mulberry32(seedFor(pair,round,`ai-${id}`));
      const chosen=config.core?chooseCorePlan({state,hand,side,rng:random,budgetMs:Infinity,samples:2,variants:RECOMMENDED,coreProfile:config.profile,policy:id==='B'?(config.policyB??'adaptive'):'adaptive'})
        :choosePlan({state:side==='a'?state:{round:state.round,a:state.b,b:state.a},hand,side:'a',rng:random,budgetMs:Infinity,depth:2,layouts:3,samples:2,counters:true,variants:RECOMMENDED});
      m.decisionMs.push(performance.now()-start);turns[side]=chosen.plan;
      for(const p of chosen.plan.placements)for(const role of ['attack','defense'])add(m.usage,`${elementOf(p[role]).id}:${role}`);
      if(config.core){
        const card=chosen.plan.coreCard,info=coreDescriptor(card);add(m.suits,card.s);add(m.ranks,card.r);
        if(hand.some(c=>c.r==='A')){m.aceAvailable++;if(card.r==='A')m.aceSelected++;}
        if(hand.some(c=>c.r==='2')){m.twoAvailable++;if(card.r==='2')m.twoSelected++;}
        for(const p of chosen.plan.placements)for(const role of ['attack','defense'])if(info.elements.includes(elementOf(p[role]).id))m.boostedOpportunities++;
        banned[id]=[card.id];
      }
    }
    const before=cloneGameState(state),options={abilities:true,counters:true,variants:RECOMMENDED,nexusCoreEnabled:config.core,coreProfile:config.profile,
      rng:mulberry32(seedFor(pair,round,'combat')),abilityRng:(side,l)=>mulberry32(seedFor(pair,round,`effect-${identity[side]}-${l}`))};
    result=resolveRound(state,turns.a,turns.b,options);
    if(config.core){
      const cf=cloneGameState(before),base=resolveRound(cf,turns.a,turns.b,{...options,nexusCoreEnabled:false,rng:mulberry32(seedFor(pair,round,'combat'))});
      m.extraDamage+=damage(result)-damage(base);m.extraHeal+=heal(result)-heal(base);
      for(const side of ['a','b'])for(let l=0;l<3;l++){
        m.extraArmor+=(state[side].statuses[l].armor??0)-(cf[side].statuses[l].armor??0);
        m.queuedBurn+=(state[side].statuses[l].burn??0)-(cf[side].statuses[l].burn??0);
      }
      for(const e of result.abilityEvents.filter(e=>e.ability==='counter_triggered')){
        const a=ABILITIES[e.canceled],owner=a.role==='attack'?(e.target==='a'?'b':'a'):e.target;
        if(coreDescriptor(turns[owner].coreCard).elements.includes(a.element))m.boostedBlocked++;
      }
      for(const element of Object.keys(ELEMENTS)){
        const sim=cloneGameState(before),disabled=Object.values(ABILITIES).filter(a=>a.element===element).map(a=>a.id);
        const r=resolveRound(sim,turns.a,turns.b,{...options,coreDisabled:disabled,rng:mulberry32(seedFor(pair,round,'combat'))});
        const target=m.elements[element]??={extraDamage:0,extraHeal:0};target.extraDamage+=damage(result)-damage(r);target.extraHeal+=heal(result)-heal(r);
      }
    }
    if(result.finished)break;
  }
  const ownerA=mirror?'b':'a',score=result.winner==='draw'?.5:result.winner===ownerA?1:0;
  return {pair,mirror:Number(mirror),score,rounds:state.round-1,winner:result.winner,nexusA:state[ownerA].nexus,nexusB:state[mirror?'a':'b'].nexus,simultaneous:Number(state.a.nexus===0&&state.b.nexus===0),seatScore:result.winner==='draw'?.5:result.winner==='a'?1:0,metrics:m};
}
if(!isMainThread){
  parentPort.on('message',pair=>{try{const rows=[];for(const c of workerData.configs)if(pair<c.games/2)for(const mirror of [false,true])rows.push({id:c.id,...play(c,pair,mirror)});parentPort.postMessage({rows});}catch(e){parentPort.postMessage({error:e.stack});}});
}else{
  const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
  const games=Number(arg('games',1000)),policyGames=Number(arg('policy-games',1000)),workers=Number(arg('workers',8)),out=arg('out','reports/nexus-core-simulations-final');
  if(games%2||policyGames%2||games<2||policyGames<2)throw Error('Even positive games required');
  const configs=[{id:'A_14_no_core',core:false,games},{id:'B_13_core_base',core:true,profile:'base',games},
    {id:'C_13_core_balanced',core:true,profile:'balanced',games},{id:'C_vs_highest',core:true,profile:'balanced',policyB:'highest',games:policyGames},
    {id:'C_vs_lowest',core:true,profile:'balanced',policyB:'lowest',games:policyGames}];
  mkdirSync(out,{recursive:true});
  const sources=['shared/nexus-core.js','shared/core-bot.js','shared/bot.js','shared/engine.js','shared/abilities.js','shared/cards.js','shared/elements.js','shared/combos.js','scripts/nexus-core-balance.mjs'];
  const hash=createHash('sha256');for(const p of sources)hash.update(p).update(readFileSync(p));
  const manifest={startedAt:new Date().toISOString(),configs,workers,seed:20261113,sourceHash:hash.digest('hex'),sources,ai:{depth:2,samples:2,legacyLayouts:3,budget:'fixed-work; Infinity'},unit:'independent mirrored seed pair'};
  writeFileSync(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
  const metrics={};for(const c of configs){metrics[c.id]={games:0,decisionMs:[]};writeFileSync(`${out}/${c.id}.csv`,'pair,mirror,score,rounds,winner,nexusA,nexusB,simultaneous,seatScore\n');}
  const merge=(a,b)=>{for(const [k,v]of Object.entries(b)){if(Array.isArray(v))(a[k]??=[]).push(...v);else if(typeof v==='number')a[k]=(a[k]??0)+v;else merge(a[k]??={},v);}};
  let next=0,completed=0,totalGames=0;const total=games/2,pool=[];
  const save=()=>{writeFileSync(`${out}/metrics.json`,JSON.stringify(metrics));writeFileSync(`${out}/status.json`,JSON.stringify({completedPairs:completed,totalPairs:total,totalGames,finished:completed===total,updatedAt:new Date().toISOString()}));};
  await new Promise((resolve,reject)=>{for(let i=0;i<workers;i++){
    const w=new Worker(new URL(import.meta.url),{workerData:{configs}});pool.push(w);
    const dispatch=()=>{if(next<total)w.postMessage(next++);else w.terminate();};
    w.on('message',m=>{if(m.error){pool.forEach(w=>w.terminate());return reject(Error(m.error));}
      for(const r of m.rows){metrics[r.id].games++;totalGames++;merge(metrics[r.id],r.metrics);appendFileSync(`${out}/${r.id}.csv`,[r.pair,r.mirror,r.score,r.rounds,r.winner,r.nexusA,r.nexusB,r.simultaneous,r.seatScore].join(',')+'\n');}
      completed++;if(completed%10===0||completed===total){save();console.log(`${completed}/${total} pairs, ${totalGames} games`);}if(completed===total)resolve();else dispatch();
    });w.on('error',reject);dispatch();
  }});
  for(const w of pool)await w.terminate();manifest.finishedAt=new Date().toISOString();writeFileSync(`${out}/manifest.json`,JSON.stringify(manifest,null,2));save();console.log('COMPLETE',totalGames);
}
