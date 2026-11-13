// In-memory SQL adapter: executes the real Edge handlers without a hosted database.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { deal } from '../shared/cards.js';
import { mulberry32 } from '../shared/rng.js';
import * as validation from '../shared/validation.js';
import { botPlan, choosePlan } from '../shared/bot.js';
import { resolveRound, newState, shieldPct } from '../shared/engine.js';
import { RECOMMENDED } from '../shared/abilities.js';
import {coreDescriptor,nextCoreHands,dealCoreHand} from '../shared/nexus-core.js';
import {chooseCorePlan} from '../shared/core-bot.js';
import * as playerDeck from '../shared/player-deck.js';

export function serverFixture({ dealHand = (enabled=false) => enabled?dealCoreHand(mulberry32(11)):deal(mulberry32(11)), core=false, persistent=false, seedNext=()=>42 } = {}) {
  const st = { board: { a: newState(), b: newState() }, hands: { 1: deal(mulberry32(3)), 2: deal(mulberry32(7)) } };
  const match = { id: 'fixture', room_code: 'TEST', player1_id: 'u1', player2_id: 'u2',
    status: 'planning', round: 1, version: 1, state: st };
  const turns = [], reports = [];
  const createdMatches=[];
  if(core){st.rules={abilities:true,counters:true,smartBot:true,variants:RECOMMENDED,nexusCoreEnabled:true,coreProfile:'balanced'};st.hands={1:dealCoreHand(mulberry32(3)),2:dealCoreHand(mulberry32(7))};st.rngSeed=42;}
  if(persistent){st.rules={...st.rules,deckVersion:2};Object.assign(st,playerDeck.createDeckMatch(mulberry32(3)));}
  const sql = async (parts, ...v) => {
    const q = parts.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('select * from private.matches')) return v[0] === (q.includes('room_code')?match.room_code:match.id) ? [match] : [];
    if(q.startsWith('select count(*)::int as count from private.matches'))return [{count:0}];
    if(q.startsWith('insert into private.matches')){
      const rematch=q.includes('player2_id');
      const created={id:rematch?'fixture-rematch':'fixture',room_code:v[0],player1_id:v[1],player2_id:rematch?v[2]:null,status:rematch?'planning':v[2],state:v[3],round:1,version:1};
      createdMatches.push(created);if(!rematch)Object.assign(match,created);return [created];
    }
    if(q.startsWith('update private.matches set status'))return [];
    if(q.startsWith('update private.matches set player2_id')){
      if(match.status!=='waiting'||match.player2_id)return [];
      Object.assign(match,{player2_id:v[0],status:'planning',round:1,state:v[1],version:match.version+1});return [match];
    }
    if (q.startsWith('select version')) return [{ version: match.version }];
    if (q.startsWith('select 1 from private.turns')) return turns.filter(t => t.round === v[1] && t.player_id === v[2]).map(() => ({ exists: 1 }));
    if (q.startsWith('insert into private.turns')) { turns.push({ round: v[1], player_id: v[2], seat: v[3], placements: v[4], fortify_lane: v[5] }); return []; }
    if (q.startsWith('select count(*)::int')) return [{ count: turns.filter(t => t.round === v[1]).length }];
    if (q.startsWith('select seat, placements')) return turns.filter(t => t.round === v[1]);
    if (q.startsWith('select count(*) filter')) return [{
      mine: turns.filter(t => t.round === v[3] && t.player_id === v[0]).length,
      theirs: turns.filter(t => t.round === v[3] && t.seat !== v[1]).length,
    }];
    if (q.startsWith('insert into private.round_events')) { reports.push({ round: v[1], public_result: v[2] }); return []; }
    if (q.startsWith('select public_result')) return reports.filter(r => r.round === v[1]);
    if (q.startsWith('update private.matches set state')) {
      if(!q.includes('round =')){match.state=v[0];if(q.includes('version = version + 1'))match.version++;return [{version:match.version}];}
      Object.assign(match, { state: v[0], round: v[1], status: v[2], winner_seat: v[3], version: match.version + 1 });
      return [{ version: match.version }];
    }
    if (q.startsWith('update private.matches set version')) { match.version++; return []; }
    throw new Error('Unhandled fixture SQL: ' + q);
  };
  let pending=Promise.resolve();
  sql.begin = fn => {
    const run=pending.then(async()=>{
      const snapshot=structuredClone({match,turns,reports});
      try{return await fn(sql);}catch(e){Object.assign(match,snapshot.match);turns.splice(0,turns.length,...snapshot.turns);reports.splice(0,reports.length,...snapshot.reports);throw e;}
    });pending=run.catch(()=>{});return run;
  }; sql.json = v => structuredClone(v);
  class HttpError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const handlers = {};
  for (const name of ['submit-turn', 'get-state','prepare-core','create-room','join-room','rematch']) {
    const source = readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8').replace(/^import .*?;\r?\n/gm, '');
    const dependencies = { Deno: { serve: fn => { handlers[name] = fn; } },
      requireUser: async req => {
        const id = req.headers.get('x-fixture-user');
        if (!id) throw new HttpError('unauthorized', 401);
        return { id };
      }, json: v => Response.json(v), err: (error, status) => Response.json({ error }, { status }),
      cors: {}, HttpError, sql, broadcastState: async () => {}, dealHand,
      ...validation, botPlan, choosePlan, resolveRound, shieldPct, mulberry32,
      RECOMMENDED, cryptoSeed: seedNext,coreDescriptor,nextCoreHands,chooseCorePlan,
      ...playerDeck,dealMatchCards:rules=>rules?.nexusCoreEnabled&&rules.deckVersion===2?playerDeck.createDeckMatch(mulberry32(seedNext())):{hands:{1:dealHand(!!rules?.nexusCoreEnabled),2:dealHand(!!rules?.nexusCoreEnabled)}},
      emptyBoard:()=>({a:newState(),b:newState()}),roomCode:()=> 'TEST' };
    new Function(...Object.keys(dependencies), stripTypeScriptTypes(source))(...Object.values(dependencies));
  }
  const call = async (name, seat, body) => {
    const response = await handlers[name](new Request('http://fixture/' + name, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-fixture-user': typeof seat === 'number' ? `u${seat}` : seat }, body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  };
  return { match, turns, reports, call,createdMatches };
}
