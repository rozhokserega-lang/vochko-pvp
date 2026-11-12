// Строгая проверка преимущества стороны (замечание №2): зеркальные пары на
// ИДЕНТИЧНЫХ раздачах. Пара = прямая партия + зеркальная (те же руки, стратегии
// на обменянных местах). Метрика: доля побед первого ходока (место 'a').
// Использование: node scripts/side-fairness.mjs --pairs 100 --matchup new-old
//   [--variant k=v,...] [--shard 0/5] --out reports/balance/sidefair_...
import { deal } from '../shared/cards.js';
import { mulberry32 } from '../shared/rng.js';
import { createGameState, resolveRound } from '../shared/engine.js';
import { gameSeed } from '../shared/seeds.js';
import { botPlan, choosePlan } from '../shared/bot.js';
import fs from 'node:fs';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const PAIRS = Number(arg('pairs', 100));
const MATCHUP = arg('matchup', 'old-old');
const SHARD = Number(arg('shard', 0)), SHARDS = Number(arg('shards', 1));
const SEED = Number(arg('seed', 1));
const VARIANT = (arg('variant', '') || '').split(',').filter(Boolean)
  .map(v => v.split('=')).reduce((acc, [k, v]) => (acc[k] = v, acc), {});
const OUT = arg('out', `reports/balance/sidefair_${MATCHUP}${Object.keys(VARIANT).length ? '_v' : ''}_s${SHARD}`);
const DEPTH = Number(arg('depth', 2)), BUDGET = Number(arg('budget', Infinity));
const COUNTERS_ON = true;

const [kindA0, kindB0] = MATCHUP.split('-');

function plan(kind, state, hand, side, rng) {
  if (kind === 'old') {
    const enemyBoard = side === 'a' ? state.b : state.a;
    const ownBoard = side === 'a' ? state.a : state.b;
    return { placements: botPlan(hand, enemyBoard, ownBoard), ms: 0 };
  }
  const r = choosePlan({ state, hand, side, rng, depth: DEPTH, budgetMs: BUDGET, counters: COUNTERS_ON, variants: VARIANT });
  return { placements: r.plan.placements, ms: r.stats.ms };
}

function game(seed, mirror) {
  const dealRng = mulberry32(seed);
  const state = createGameState();
  let winner = null, rounds = 0;
  while (true) {
    const hA = deal(dealRng), hB = deal(dealRng);
    const [saK, saH, sbK, sbH] = mirror ? [kindB0, hB, kindA0, hA] : [kindA0, hA, kindB0, hB];
    // Separate random streams keep the exact same hands and luck for each identity after swapping seats.
    const identityA = mirror ? 1 : 0, identityB = 1 - identityA;
    const stream = offset => mulberry32(gameSeed(seed, rounds * 8 + offset));
    const pa = plan(saK, state, saH, 'a', stream(identityA)), pb = plan(sbK, state, sbH, 'b', stream(identityB));
    const r = resolveRound(state, pa, pb, { abilities: true, rngBySide: { a: stream(identityA+2), b: stream(identityB+2) }, counters: COUNTERS_ON, variants: VARIANT });
    rounds++;
    if (r.finished) { winner = r.winner; break; }
    if (rounds >= 45) { winner = 'draw'; break; }
  }
  // Победитель первого ходока (место 'a' всегда ходит первым в resolveRound).
  return { firstMoverWin: winner === 'a', winner, rounds, mirror };
}

const rows = [];
for (let i = 0; i < PAIRS; i++) {
  const seed = gameSeed(SEED, (SHARD * 7919 + i) % 100000);
  rows.push({ ...game(seed, false), seed, pair: i });
  rows.push({ ...game(seed, true), seed, pair: i, mirror: true });
}
const firstMoverWins = rows.filter(r => r.firstMoverWin).length;
const decided = rows.filter(r => r.winner !== 'draw').length;
const draws = rows.length - decided;
// Только решённые партии: доля побед первого ходока.
const fmDecided = rows.filter(r => r.winner !== 'draw');
const fmW = fmDecided.filter(r => r.firstMoverWin).length;
const p = fmW / fmDecided.length, z = 1.96, n = fmDecided.length;
const den = 1 + z * z / n, c = (p + z * z / (2 * n)) / den;
const half = z * Math.sqrt((p * (1 - p)) / n + z * z / (4 * n * n)) / den;
const summary = {
  matchup: MATCHUP, variants: VARIANT, pairs: PAIRS, games: rows.length,
  firstMoverWins: fmW, decided,
  firstMoverWinRate: +p.toFixed(3), ci95: [+(Math.max(0, c - half) * 100).toFixed(1), +(Math.min(1, c + half) * 100).toFixed(1)],
  draws, drawRate: +(draws / rows.length * 100).toFixed(1), avgRounds: +(rows.reduce((s, r) => s + r.rounds, 0) / rows.length).toFixed(2),
  shard: `${SHARD}/${SHARDS}`,
};
fs.writeFileSync(OUT + '.json', JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary));
