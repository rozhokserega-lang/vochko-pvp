// In-memory SQL adapter: executes the real Edge handlers without a hosted database.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { deal } from '../shared/cards.js';
import { mulberry32 } from '../shared/rng.js';
import * as validation from '../shared/validation.js';
import { botPlan } from '../shared/bot.js';
import { resolveRound, newState, shieldPct } from '../shared/engine.js';

export function serverFixture({ dealHand = () => deal(mulberry32(11)) } = {}) {
  const st = { board: { a: newState(), b: newState() }, hands: { 1: deal(mulberry32(3)), 2: deal(mulberry32(7)) } };
  const match = { id: 'fixture', room_code: 'TEST', player1_id: 'u1', player2_id: 'u2',
    status: 'planning', round: 1, version: 1, state: st };
  const turns = [], reports = [], broadcasts = [];
  const sql = async (parts, ...v) => {
    const q = parts.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('select * from private.matches')) return v[0] === match.id ? [match] : [];
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
      Object.assign(match, { state: v[0], round: v[1], status: v[2], winner_seat: v[3], version: match.version + 1 });
      return [{ version: match.version }];
    }
    if (q.startsWith('update private.matches set version')) { match.version++; return []; }
    throw new Error('Unhandled fixture SQL: ' + q);
  };
  sql.begin = fn => fn(sql); sql.json = v => structuredClone(v);
  class HttpError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const handlers = {};
  for (const name of ['submit-turn', 'get-state']) {
    const source = readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8').replace(/^import .*?;\r?\n/gm, '');
    const dependencies = { Deno: { serve: fn => { handlers[name] = fn; } },
      requireUser: async req => {
        const id = req.headers.get('x-fixture-user');
        if (!id) throw new HttpError('unauthorized', 401);
        return { id };
      }, json: v => Response.json(v), err: (error, status) => Response.json({ error }, { status }),
      cors: {}, HttpError, sql, broadcastState: async (...args) => { broadcasts.push(args); }, dealHand,
      ...validation, botPlan, resolveRound, shieldPct };
    new Function(...Object.keys(dependencies), stripTypeScriptTypes(source))(...Object.values(dependencies));
  }
  const call = async (name, seat, body) => {
    const response = await handlers[name](new Request('http://fixture/' + name, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-fixture-user': typeof seat === 'number' ? `u${seat}` : seat }, body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  };
  return { match, turns, reports, broadcasts, call };
}
