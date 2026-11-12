// Турнир AI: старый бот против старого, новый против старого, ablation-тесты.
// Использование:
//   node scripts/tournament.mjs --games 1000 --matchup new-old --seed 1
//   node scripts/tournament.mjs --games 300 --matchup new-new --ablate fire_burn
//   node scripts/tournament.mjs --all --games 500
// Результаты: reports/*.json + reports/*.csv (seed и параметры в каждом файле).
import { deal } from '../shared/cards.js';
import { mulberry32 } from '../shared/rng.js';
import { createGameState, resolveRound } from '../shared/engine.js';
import { elementOf, ELEMENTS } from '../shared/elements.js';
import { botPlan, choosePlan } from '../shared/bot.js';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const hasFlag = (name) => args.includes('--' + name);

const GAMES = Number(arg('games', 500));
const SEED = Number(arg('seed', 1));
const DEPTH = Number(arg('depth', 2));
const SAMPLES = Number(arg('samples', 5));
const LAYOUTS = Number(arg('layouts', 8));
const BUDGET = Number(arg('budget', 700));
const ABLATE = arg('ablate', null);
const COUNTERS_ON = arg('counters', 'on') !== 'off'; // контрстихии вкл по умолчанию
const OUT = arg('out', null);
const MATCHUP = arg('matchup', 'new-old');
const PARAMS = { games: GAMES, seed: SEED, depth: DEPTH, samples: SAMPLES, layouts: LAYOUTS, budgetMs: BUDGET, ablate: ABLATE, counters: COUNTERS_ON };

const ABILITY_IDS = ['fire_burn','fire_retaliation','water_strip_armor','water_cleanse','earth_pierce_def',
  'earth_armor','air_weaken_def','air_reflect','steam_weaken_def','steam_dampen','lava_pierce_burn','lava_counter',
  'fire_vortex_spread','fire_vortex_zaslon','ice_weaken_def','ice_weaken_atk','thunderstorm_discharge',
  'thunderstorm_charge','sandstorm_weaken_atk','sandstorm_shield'];

// Ход бота: 'old' — legacy botPlan, 'new' — Monte Carlo.
function makePlan(kind, state, hand, side, rng, disabled, counters) {
  const t0 = performance.now();
  let placements;
  if (kind === 'old') {
    const enemyBoard = side === 'a' ? state.b : state.a;
    const ownBoard = side === 'a' ? state.a : state.b;
    placements = botPlan(hand, enemyBoard, ownBoard);
  } else {
    placements = choosePlan({
      state, hand, side, rng, depth: DEPTH, samples: SAMPLES, layouts: LAYOUTS, budgetMs: BUDGET, counters,
    }).plan.placements;
  }
  return { placements, ms: performance.now() - t0 };
}

function elementUsage(placements) {
  const usage = {};
  for (const p of placements) {
    usage[`${elementOf(p.attack)?.id}@atk`] = (usage[`${elementOf(p.attack)?.id}@atk`] ?? 0) + 1;
    usage[`${elementOf(p.defense)?.id}@def`] = (usage[`${elementOf(p.defense)?.id}@def`] ?? 0) + 1;
  }
  return usage;
}

const add = (map, key, n) => { map[key] = (map[key] ?? 0) + n; };

function playGame(kindA, kindB, seed) {
  const rng = mulberry32(seed);
  const state = createGameState();
  const stats = {
    rounds: 0, ms: { a: [], b: [] },
    elementUsage: { a: {}, b: {} },
    abilityTriggers: {}, abilityDamage: {}, abilityHeal: {},
    defensiveTriggers: 0, defensiveDamage: 0, defensiveHeal: 0,
    burnTickDamage: 0,
  };
  let result = null;
  while (true) {
    const hA = deal(rng), hB = deal(rng);
    const planA = makePlan(kindA, state, hA, 'a', rng, null, COUNTERS_ON);
    const planB = makePlan(kindB, state, hB, 'b', rng, null, COUNTERS_ON);
    stats.ms.a.push(planA.ms); stats.ms.b.push(planB.ms);
    for (const [side, plan] of [['a', planA], ['b', planB]])
      for (const [k, v] of Object.entries(elementUsage(plan.placements))) add(stats.elementUsage[side], k, v);
    result = resolveRound(state, planA, planB, {
      abilities: true, rng, counters: COUNTERS_ON, ...(ABLATE ? { disabled: [ABLATE] } : {}),
    });
    stats.rounds += 1;
    for (const e of result.abilityEvents) {
      add(stats.abilityTriggers, `${e.ability}/${e.effect}`, 1);
      if (e.effect === 'damage') {
        add(stats.abilityDamage, e.ability, e.amount);
        add(stats.abilityDamage, '__total', e.amount);
      }
      if (e.effect === 'heal') add(stats.abilityHeal, e.ability, e.amount);
      if (e.ability === 'burn_tick') stats.burnTickDamage += e.amount;
    }
    if (result.finished) break;
    if (stats.rounds >= 45) break;
  }
  return {
    seed, kindA, kindB,
    winner: result.winner, // 'a' | 'b' | 'draw'
    rounds: stats.rounds,
    nexus: { a: state.a.nexus, b: state.b.nexus },
    ...stats,
  };
}

function timeStats(list) {
  if (!list.length) return { mean: 0, p95: 0, max: 0 };
  const s = [...list].sort((x, y) => x - y);
  return {
    mean: +(s.reduce((a, x) => a + x, 0) / s.length).toFixed(2),
    p95: +s[Math.min(s.length - 1, Math.floor(s.length * 0.95))].toFixed(2),
    max: +s[s.length - 1].toFixed(2),
  };
}

function aggregate(games) {
  const agg = {
    params: PARAMS, games: games.length,
    wins: { a: 0, b: 0, draw: 0 },
    smartWins: 0, oldWins: 0,
    avgRounds: 0, avgNexus: { a: 0, b: 0 },
    decisionTime: {},
    elementUsage: { a: {}, b: {} },
    abilityTriggers: {}, abilityDamage: {}, abilityHeal: {},
    defensiveTriggers: 0, defensiveDamage: 0, defensiveHeal: 0,
    burnTickDamage: 0,
  };
  for (const g of games) {
    agg.wins[g.winner] += 1;
    if (g.winner !== 'draw') {
      const winnerKind = g.winner === 'a' ? g.kindA : g.kindB;
      if (winnerKind === 'new') agg.smartWins++; else agg.oldWins++;
    }
    agg.avgRounds += g.rounds;
    agg.avgNexus.a += g.nexus.a; agg.avgNexus.b += g.nexus.b;
    for (const side of ['a', 'b']) {
      const key = g['kind' + side.toUpperCase()];
      agg.decisionTime[key] ??= { all: [], a: [], b: [] };
      agg.decisionTime[key].all.push(...g.ms[side]);
      agg.decisionTime[key][side].push(...g.ms[side]);
      for (const [k, v] of Object.entries(g.elementUsage[side])) add(agg.elementUsage[side], k, v);
    }
    for (const [k, v] of Object.entries(g.abilityTriggers)) add(agg.abilityTriggers, k, v);
    for (const [k, v] of Object.entries(g.abilityDamage)) add(agg.abilityDamage, k, v);
    for (const [k, v] of Object.entries(g.abilityHeal)) add(agg.abilityHeal, k, v);
    agg.defensiveTriggers += g.defensiveTriggers;
    agg.defensiveDamage += g.defensiveDamage;
    agg.defensiveHeal += g.defensiveHeal;
    agg.burnTickDamage += g.burnTickDamage;
  }
  agg.avgRounds = +(agg.avgRounds / games.length).toFixed(2);
  agg.avgNexus.a = +(agg.avgNexus.a / games.length).toFixed(2);
  agg.avgNexus.b = +(agg.avgNexus.b / games.length).toFixed(2);
  agg.decisionTime = Object.fromEntries(Object.entries(agg.decisionTime)
    .map(([k, v]) => [k, timeStats(v.all)]));
  agg.smartWinRate = +(agg.smartWins / (games.length - agg.wins.draw)).toFixed(3);
  return agg;
}

// defensiveStats: защитные способности по таблице + тик поджога.
const defensive = (abilityId) => {
  // Защитные способности по таблице:
  const DEF = new Set(['fire_retaliation','water_cleanse','earth_armor','air_reflect','steam_dampen',
    'lava_counter','fire_vortex_zaslon','ice_weaken_atk','thunderstorm_charge','sandstorm_shield']);
  return DEF.has(abilityId);
};

// Пересчёт защитной статистики по сырым триггерам.
function defensiveStats(games) {
  let triggers = 0, damage = 0, heal = 0;
  const byAbility = {};
  for (const g of games) {
    for (const [key, n] of Object.entries(g.abilityTriggers)) {
      const [id, effect] = key.split('/');
      if (!defensive(id) && id !== 'burn_tick') continue;
      triggers += n;
      byAbility[id] ??= { triggers: 0, damage: 0, heal: 0 };
      byAbility[id].triggers += n;
    }
    for (const [id, v] of Object.entries(g.abilityDamage)) {
      if (id === '__total' || (!defensive(id) && id !== 'burn_tick')) continue;
      damage += v;
      byAbility[id].damage += v;
    }
    for (const [id, v] of Object.entries(g.abilityHeal)) {
      if (!defensive(id)) continue;
      heal += v;
      byAbility[id].heal += v;
    }
  }
  return { triggers, damage, heal, byAbility };
}

async function main() {
  const matchups = hasFlag('all') ? ['old-old', 'new-old', 'old-new', 'new-new'] : [MATCHUP];
  fs.mkdirSync('reports', { recursive: true });
  const results = [];
  for (const matchup of matchups) {
    const [kindA, kindB] = matchup.split('-');
    const games = [];
    const t0 = performance.now();
    for (let i = 0; i < GAMES; i++) {
      // Одинаковые начальные условия со сменой сторон: seed, swap.
      const swap = i % 2 === 1;
      const seed = SEED + Math.floor(i / 2) * 1000;
      const g = playGame(swap ? kindB : kindA, swap ? kindA : kindB, seed + (swap ? 0.5 : 0));
      if (swap) {
        g.kindA = kindA; g.kindB = kindB;
        g.winner = g.winner === 'a' ? 'b' : g.winner === 'b' ? 'a' : 'draw';
        const { a, b, ...restNexus } = g.nexus;
        g.nexus = { a: b, b: a };
        g.ms = { a: g.ms.b, b: g.ms.a };
        g.elementUsage = { a: g.elementUsage.b, b: g.elementUsage.a };
      }
      g.matchup = matchup;
      games.push(g);
    }
    const wall = +(performance.now() - t0).toFixed(0);
    const agg = aggregate(games);
    agg.defensive = defensiveStats(games);
    agg.wallMs = wall;
    const base = `tournament_${matchup}${ABLATE ? '_ablate-' + ABLATE : ''}_g${GAMES}${COUNTERS_ON ? '_ctr' : ''}`;
    fs.writeFileSync(path.join('reports', base + '.json'), JSON.stringify({ params: PARAMS, matchup, ...agg }, null, 2));
    const csv = 'seed,matchup,winner,rounds,nexusA,nexusB\n' +
      games.map(g => [g.seed, g.matchup, g.winner, g.rounds, g.nexus.a, g.nexus.b].join(',')).join('\n');
    fs.writeFileSync(path.join('reports', base + '.csv'), csv);
    results.push({ matchup, ...agg });
    console.log(`${matchup}${COUNTERS_ON ? ' [counters]' : ''}: smartWinRate=${agg.smartWinRate} wins a/b/draw=${agg.wins.a}/${agg.wins.b}/${agg.wins.draw} avgRounds=${agg.avgRounds} wall=${wall}ms`);
    if (agg.decisionTime.new) console.log(`  decision new: mean=${agg.decisionTime.new.mean}ms p95=${agg.decisionTime.new.p95}ms max=${agg.decisionTime.new.max}ms`);
  }
  if (hasFlag('all')) {
    const ts = Date.now();
    fs.writeFileSync(path.join('reports', `tournament_all_g${GAMES}.json`), JSON.stringify({ params: PARAMS, ts, results }, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
