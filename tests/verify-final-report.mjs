// Диагностика: что возвращает get-state сразу после ФИНАЛА матча (vs бот).
// Нужен живой Supabase (.env.local).
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(Boolean).map((l) => l.split('=')));
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const signup = async () => (await (await fetch(URL + '/auth/v1/signup', { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: '{}' })).json());
const call = (token) => async (fn, body) => (await (await fetch(URL + '/functions/v1/' + fn, { method: 'POST', headers: { apikey: KEY, authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json());
const turn = (v) => {
  const reds = v.me.hand.filter((c) => c.s === '♥' || c.s === '♦').slice(0, 6);
  const blacks = v.me.hand.filter((c) => c.s === '♠' || c.s === '♣').slice(0, 6);
  return { matchId: v.matchId, round: v.round, expectedVersion: v.version,
    placements: [0,1,2].map((l) => ({ lane: l, attack: [reds[2*l].id, reds[2*l+1].id], defense: [blacks[2*l].id, blacks[2*l+1].id] })) };
};
const A = await signup();
const api = call(A.access_token);
const room = (await api('create-room', { vsBot: true }));
console.log('botMatch:', room.matchId);
let v = (await api('get-state', { matchId: room.matchId }));
let rounds = 0, guard = 0;
while (v.status !== 'finished' && guard++ < 60) {
  const r = await api('submit-turn', turn(v));
  if (!r.resolved) { console.log('UNEXPECTED not resolved at round', v.round); break; }
  v = (await api('get-state', { matchId: room.matchId }));
  rounds++;
}
console.log('finished:', v.status === 'finished', `раундов сыграно: ${rounds}`, 'финальный round в DTO:', v.round);
const rep = v.latestRoundReport;
const repRows = rep?.report ?? [];
console.log('latestRoundReport: first row round =', repRows[0]?.round, '— ожидалось (финальны) =', v.round);
console.log('winner seat (serverside):', v.winner);
// ярлык: могла ли анимация по этой DTO запуститься?
const needsAnim = !!rep?.events?.length;
console.log(needsAnim ? 'есть events — DTO готова для анимации' : '!!! events отсутствуют — анимации не будет');
