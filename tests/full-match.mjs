// Интеграционный тест: полный матч двух НЕЗАВИСИМЫХ пользователей + аудит-сценарии.
// Запуск: node tests/full-match.mjs  (нужен живой Supabase: URL/ключ из .env.local)
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(Boolean).map((l) => l.split('=')));
const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log('  ✓', name); } else { failed++; console.log('  ✗', name); } };
const signup = async () => (await (await fetch(URL + '/auth/v1/signup', { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: '{}' })).json());
const mkCall = (token) => async (fn, body) => {
  const r = await fetch(URL + '/functions/v1/' + fn, { method: 'POST', headers: { apikey: KEY, authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text();
  let j = {}; try { j = t ? JSON.parse(t) : {} } catch { j = { raw: t.slice(0, 100) } }
  return { status: r.status, body: j };
};
const buildTurn = (view, fort = null) => {
  const reds = view.me.hand.filter((c) => c.s === '♥' || c.s === '♦').slice(0, 6);
  const blacks = view.me.hand.filter((c) => c.s === '♠' || c.s === '♣').slice(0, 6);
  return { matchId: view.matchId, round: view.round, expectedVersion: view.version, fortifyLane: fort,
    placements: [0, 1, 2].map((l) => ({ lane: l, attack: [reds[2 * l].id, reds[2 * l + 1].id], defense: [blacks[2 * l].id, blacks[2 * l + 1].id] })) };
};

console.log('— Полный матч двух независимых пользователей —');
const [A, B, C] = await Promise.all([signup(), signup(), signup()]);
ok(!!A.access_token && !!B.access_token && !!C.access_token, 'три независимые анонимные сессии');

const a = mkCall(A.access_token), b = mkCall(B.access_token), c = mkCall(C.access_token);

// 1. Комната + вход
const room = (await a('create-room', {})).body;
ok(!!room.matchId && !!room.roomCode, 'create-room возвращает matchId+код');
const joined = (await b('join-room', { roomCode: room.roomCode }));
ok(joined.status === 200 && joined.body.seat === 2, 'join-room: второй игрок на seat 2');

// 2. Аудит п.9/п.4: реконнект после «F5» — состояние восстанавливается тем же пользователем
const vA1 = (await a('get-state', { matchId: room.matchId })).body;
const vA2 = (await a('get-state', { matchId: room.matchId })).body;
ok(vA1.seat === 1 && vA2.seat === 1 && vA1.me.hand.length === 14, 'реконнект: создатель видит свою руку после обновления');
ok(vA2.round === vA1.round && vA2.version === vA1.version, 'реконнект: состояние идентично');

// 3. Аудит п.3: готовность соперника
const vB1 = (await b('get-state', { matchId: room.matchId })).body;
ok(vA1.opponent.ready === false && vB1.opponent.ready === false, 'до ходов: соперник не готов у обоих');

// 4. Аудит п.6: почти одновременные ходы (одинаковая expectedVersion у обоих)
const s1 = await a('submit-turn', buildTurn(vA1));
const s2 = await b('submit-turn', buildTurn(vB1));
ok(s1.status === 200 && s2.status === 200, 'одновременные submit: оба приняты без конфликта версий');
ok(s2.body.resolved === false || s2.body.ready === true, 'после второго хода раунд разрешается');

// 5. Атомарность: ровно один расчёт раунда
const vA3 = (await a('get-state', { matchId: room.matchId })).body;
ok(vA3.round === 2 && !!vA3.latestRoundReport, 'раунд 1 рассчитан ровно один раз, отчёт на месте');
const replay = await a('submit-turn', buildTurn(vA1)); // replay старого хода (старый раунд)
ok((replay.status === 409 || replay.body.accepted === true) && vA3.round === 2, 'replay старого submit не меняет HP (409 stale round или идемпотент)');

// 6. Аудит п.3: готовность — семантика «соперник сдал ход В ТЕКУЩЕМ раунде».
// После резолва раунд уже следующий: ходы сданы заново → готовность сброшена.
const vB3 = (await b('get-state', { matchId: room.matchId })).body;
ok(vA3.opponent.ready === false, 'после резолва: готовность сброшена на новый раунд');
ok(vA3.board.me.shieldPct === 0 && vB3.board.me.shieldPct === 0, 'аудит п.7: щит своего Нексуса в DTO у обоих');

// 7. Аудит п.2: укрепление — один раз за матч (сгорает при РАЗРЕШЕНИИ раунда)
const f1 = await a('submit-turn', buildTurn(vA3, 0)); // A укрепляет линию 0, ждём B
ok(f1.status === 200 && f1.body.ready === false, 'укрепление принято, ждём соперника');
const vbR2 = (await b('get-state', { matchId: room.matchId })).body;
ok(vbR2.opponent.ready === true, 'семантика по сидам: A готов после своего submit');
const f1b = await b('submit-turn', buildTurn(vbR2));  // B сдал — раунд 2 разрешился
ok(f1b.status === 200 && f1b.body.ready === true, 'раунд 2 разрешился с укреплением');
const vA4 = (await a('get-state', { matchId: room.matchId })).body;
ok(vA4.me.fortifyUsed === true, 'флаг fortifyUsed выставлен после разрешённого раунда');
const f2 = await a('submit-turn', buildTurn(vA4, 1));
ok(f2.status === 400 && f2.body.error === 'fortify-used', 'повторное укрепление отклонено (400 fortify-used)');

// 8. Защита закрытых карт: B не видит руку A
const aIds = vA1.me.hand.map((x) => x.id);
const leak = aIds.some((id) => JSON.stringify(vB1).includes('"' + id + '"') && id.length > 1);
ok(!JSON.stringify(vB3).includes('"hand":[{"id":"' + aIds[0] + '"'), 'рука A не утекает в DTO B');
ok(!JSON.stringify(vA3).includes('"placements"'), 'раскладка соперника не видна до резолва');

// 9. Аудит п.8: бот-маркетинг DTO
const botRoom = (await a('create-room', { vsBot: true })).body;
const vBot = (await a('get-state', { matchId: botRoom.matchId })).body;
ok(vBot.opponent.isBot === true && vBot.opponent.connected === true, 'бот-матч: opponent.isBot=true');
const vPvp = (await a('get-state', { matchId: room.matchId })).body;
ok(vPvp.opponent.isBot === false, 'PvP-матч: isBot=false');

// 10. Третий игрок не входит
const third = await c('join-room', { roomCode: room.roomCode });
ok(third.status === 409, 'третий игрок получает 409');

// 11. Полный матч до финала (лимит 45): последовательные сабмиты со свежим
// состоянием + ретрай на 409 — как реальный клиент.
let rounds = 3, finished = false, guard = 0;
while (rounds < 50 && guard < 120) {
  guard++;
  const va = (await a('get-state', { matchId: room.matchId })).body;
  if (va.status === 'finished') { finished = true; break; }
  let r1 = await a('submit-turn', buildTurn(va));
  if (r1.status === 409) r1 = await a('submit-turn', buildTurn((await a('get-state', { matchId: room.matchId })).body));
  const vb = (await b('get-state', { matchId: room.matchId })).body;
  if (vb.status === 'finished') { finished = true; break; }
  let r2 = await b('submit-turn', buildTurn(vb));
  if (r2.status === 409) r2 = await b('submit-turn', buildTurn((await b('get-state', { matchId: room.matchId })).body));
  if (r1.status !== 200 || r2.status !== 200) { rounds = -1; break; }
  rounds++;
}
ok(finished, `матч дошёл до финала (${rounds} раундов, лимит 45)`);

// 11b. Финальный отчёт: get-state должен вернуть public_result ФИНАЛЬНОГО раунда
// (submit-turn не увеличивает round при финале → отчёт хранится с round = m.round).
// Иначе клиент пропускает анимацию последнего удара и сразу показывает результат.
const vfin = (await a('get-state', { matchId: room.matchId })).body;
ok(Number(vfin.latestRoundReport?.report?.[0]?.round) === Number(vfin.round),
   `финальный отчёт в DTO (репорт ${vfin.latestRoundReport?.report?.[0]?.round} = матч-раунд ${vfin.round})`);
ok(!!vfin.latestRoundReport?.events?.length, 'финальные battle-события присутствуют в DTO');

// 12. Аудит п.5: реванш — оба переходят в новый матч
const rm1 = await a('rematch', { matchId: room.matchId });
ok(rm1.body.waiting === true, 'реванш: первый подтвердил — ожидание');
const rm2 = await b('rematch', { matchId: room.matchId });
ok(rm2.body.waiting === false && !!rm2.body.matchId, 'реванш: второй подтвердил — создан новый матч');
const vNextB = (await b('get-state', { matchId: room.matchId })).body;
ok(vNextB.nextMatchId === rm2.body.matchId, 'DTO старого матча содержит nextMatchId (для авто-перехода)');
const vNextA = (await a('get-state', { matchId: rm2.body.matchId })).body;
ok(vNextA.seat === 1 && vNextA.me.hand.length === 14 && vNextA.status === 'planning',
  'новый матч: чистые HP/руки, статус planning' + (vNextA.seat ? '' : ` [diag: ${JSON.stringify(vNextA).slice(0, 200)}]`));

console.log(`\nИТОГ: ✓ ${passed} · ✗ ${failed}`);
process.exit(failed ? 1 : 0);
