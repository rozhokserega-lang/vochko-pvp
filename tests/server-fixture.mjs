// Executes every actual Edge handler with imported bindings and an in-memory SQL store.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { deal, dealBalancedLegacy } from '../shared/cards.js';
import { mulberry32 } from '../shared/rng.js';
import * as validation from '../shared/validation.js';
import { botPlan, choosePlan } from '../shared/bot.js';
import { resolveRound, newState, shieldPct } from '../shared/engine.js';
import { RECOMMENDED } from '../shared/abilities.js';
export function serverFixture({ dealHand = mode => (mode==='balanced'?dealBalancedLegacy:deal)(mulberry32(11)) } = {}) {
  const st={board:{a:newState(),b:newState()},hands:{1:deal(mulberry32(3)),2:deal(mulberry32(7))}};
  const match={id:'fixture',room_code:'TEST',player1_id:'u1',player2_id:'u2',status:'planning',round:1,version:1,state:st};
  const matches=[match],turns=[],reports=[],broadcasts=[];
  let code=0,queue=Promise.resolve();
  const sql=async(parts,...v)=>{
    const q=parts.join('?').replace(/\s+/g,' ').trim();
    if(q.startsWith('select * from private.matches'))return matches.filter(m=>q.includes('room_code =')?m.room_code===v[0]:m.id===v[0]);
    if(q.startsWith('select version'))return matches.filter(m=>m.id===v[0]).map(m=>({version:m.version}));
    if(q.startsWith('select 1 from private.turns'))return turns.filter(t=>t.match_id===v[0]&&t.round===v[1]&&t.player_id===v[2]).map(()=>({exists:1}));
    if(q.startsWith('insert into private.turns')){turns.push({match_id:v[0],round:v[1],player_id:v[2],seat:v[3],placements:v[4],fortify_lane:v[5]});return[];}
    if(q.startsWith('select count(*)::int')&&q.includes('private.matches'))return[{count:matches.filter(m=>m.player1_id===v[0]&&m.status==='waiting').length}];
    if(q.startsWith('select count(*)::int'))return[{count:turns.filter(t=>t.match_id===v[0]&&t.round===v[1]).length}];
    if(q.startsWith('select placements from private.turns'))return turns.filter(t=>t.match_id===v[0]&&t.round===v[1]&&t.player_id===v[2]);
    if(q.startsWith('select seat, placements'))return turns.filter(t=>t.match_id===v[0]&&t.round===v[1]);
    if(q.startsWith('select count(*) filter'))return[{mine:turns.filter(t=>t.match_id===v[2]&&t.round===v[3]&&t.player_id===v[0]).length,theirs:turns.filter(t=>t.match_id===v[2]&&t.round===v[3]&&t.seat!==v[1]).length}];
    if(q.startsWith('insert into private.round_events')){reports.push({match_id:v[0],round:v[1],public_result:v[2]});return[];}
    if(q.startsWith('select public_result'))return reports.filter(r=>r.match_id===v[0]&&r.round===v[1]);
    if(q.startsWith('insert into private.matches')){
      const rematch=q.includes('player2_id'),m={id:`fixture-${matches.length}`,room_code:v[0],player1_id:v[1],player2_id:rematch?v[2]:null,status:rematch?'planning':v[2],round:1,version:1,state:rematch?v[3]:v[3]};matches.push(m);return[m];
    }
    if(q.startsWith("update private.matches set status = 'finished'")){for(const m of matches)if(m.player1_id===v[0]&&m.status==='waiting')m.status='finished';return[];}
    if(q.startsWith('update private.matches set player2_id')){
      const m=matches.find(m=>m.id===v[2]&&m.status==='waiting'&&!m.player2_id&&m.player1_id!==v[3]);if(!m)return[];
      Object.assign(m,{player2_id:v[0],status:'planning',round:1,state:v[1],version:m.version+1});return[m];
    }
    if(q.includes("set state = state - 'leftSeat'")){const m=matches.find(m=>m.id===v[0]);if(m?.state.leftSeat===v[1]){delete m.state.leftSeat;m.version++;}return[];}
    if(q.includes("jsonb_build_object('leftSeat'")){const m=matches.find(m=>m.id===v[1]&&[m.player1_id,m.player2_id].includes(v[2])&&m.status!=='finished');if(!m)return[];m.state.leftSeat=v[0]===m.player1_id?1:2;m.version++;return[m];}
    if(q.startsWith('update private.matches set state')){
      const resolving=q.includes('round ='),m=matches.find(m=>m.id===v[resolving?4:1]);m.state=v[0];
      if(resolving)Object.assign(m,{round:v[1],status:v[2],winner_seat:v[3]});
      if(q.includes('version = version + 1'))m.version++;return[m];
    }
    if(q.startsWith('update private.matches set version')){const m=matches.find(m=>m.id===v[0]);m.version++;return[m];}
    throw Error('Unhandled fixture SQL: '+q);
  };
  sql.begin=fn=>{const r=queue.then(()=>fn(sql));queue=r.catch(()=>{});return r;};sql.json=v=>structuredClone(v);
  class HttpError extends Error{constructor(message,status=400){super(message);this.status=status;}}
  const handlers={};
  for(const name of ['create-room','join-room','submit-turn','get-state','rematch','leave-room']){
    const raw=readFileSync(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8');
    const all={requireUser:async req=>{const id=req.headers.get('x-fixture-user');if(!id)throw new HttpError('unauthorized',401);return{id};},json:v=>Response.json(v),err:(error,status=500)=>Response.json({error},{status}),cors:{},HttpError,sql,broadcastState:async(...args)=>broadcasts.push(args),dealHand,emptyBoard:()=>({a:newState(),b:newState()}),roomCode:()=>`CODE${++code}`,cryptoSeed:()=>42,...validation,botPlan,choosePlan,resolveRound,shieldPct,mulberry32,RECOMMENDED};
    // Only actual imported identifiers are injected: missing imports fail as in Deno.
    const names=[...raw.matchAll(/^import \{([^}]+)\}.*?;\r?$/gm)].flatMap(m=>m[1].split(',').map(s=>s.trim()));
    const deps={Deno:{serve:fn=>handlers[name]=fn},...Object.fromEntries(names.map(n=>[n,all[n]]))};
    const source=raw.replace(/^import .*?;\r?\n/gm,'');
    new Function(...Object.keys(deps),stripTypeScriptTypes(source))(...Object.values(deps));
  }
  const call=async(name,seat,body)=>{const r=await handlers[name](new Request('http://fixture/'+name,{method:'POST',headers:{'content-type':'application/json','x-fixture-user':typeof seat==='number'?`u${seat}`:seat},body:JSON.stringify(body)}));return{status:r.status,body:await r.json()};};
  return{match,matches,turns,reports,broadcasts,call};
}
