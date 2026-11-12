import {deal} from './cards.js';
import {initialMatch,resolveAbilitiesRound} from './abilities-engine.js';
import {candidate,choosePlan,seeded} from './monte-carlo-bot.js';
import fs from 'node:fs';
const N=Number(process.argv[2]||40),rows=[];
for(let seed=1;seed<=N;seed++)for(const swapped of [false,true]){
 const rng=seeded(seed*137+19),state=initialMatch();let result;
 while(true){const hA=deal(rng),hB=deal(rng);
 const smarter=swapped?'b':'a';
 const a=smarter==='a'?choosePlan({state,hand:hA,side:'a',rng,candidates:10,samples:5}).plan:candidate(hA,state.a,state.b,rng,'aware');
 const b=smarter==='b'?choosePlan({state,hand:hB,side:'b',rng,candidates:10,samples:5}).plan:candidate(hB,state.b,state.a,rng,'aware');
 result=resolveAbilitiesRound(state,a,b);if(result.finished)break;
 }
 const winner=result.winner;rows.push({seed,smartSide:swapped?'b':'a',winner,rounds:state.round-1,smartScore:winner==='draw'?.5:winner===(swapped?'b':'a')?1:0});
}
fs.writeFileSync(new URL('./tournament.csv',import.meta.url),'seed,smartSide,winner,rounds,smartScore\n'+rows.map(r=>Object.values(r).join(',')).join('\n'));
console.log(JSON.stringify({matches:rows.length,smartScore:rows.reduce((a,r)=>a+r.smartScore,0)/rows.length,avgRounds:rows.reduce((a,r)=>a+r.rounds,0)/rows.length,bySide:['a','b'].map(side=>({side,score:rows.filter(r=>r.smartSide===side).reduce((a,r)=>a+r.smartScore,0)/(rows.length/2)}))},null,2));
