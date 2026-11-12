// Ablation-серия: отключение по одной способности и сравнение с базой.
// Результат: reports/ablation_summary.json (+ CSV per-run от tournament.mjs).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const GAMES = Number(process.argv[2] ?? 300);
const SEED = Number(process.argv[3] ?? 1);
const SUFFIX = process.argv.includes('--counters') ? '_ctr' : '';
const ABILITIES = ['fire_burn','fire_retaliation','water_strip_armor','water_cleanse','earth_pierce_def',
  'earth_armor','air_weaken_def','air_reflect','steam_weaken_def','steam_dampen','lava_pierce_burn','lava_counter',
  'fire_vortex_spread','fire_vortex_zaslon','ice_weaken_def','ice_weaken_atk','thunderstorm_discharge',
  'thunderstorm_charge','sandstorm_weaken_atk','sandstorm_shield'];

// База без ablation: при отсутствии — запускаем.
const baseFile = new URL(`../reports/tournament_new-old_g${GAMES}${SUFFIX}.json`, import.meta.url);
if (!fs.existsSync(baseFile)) {
  console.log('base run (no ablation)…');
  execFileSync(process.execPath, ['scripts/tournament.mjs',
    '--games', String(GAMES), '--matchup', 'new-old', '--seed', String(SEED), '--budget', '300',
    ...(process.argv.includes('--counters') ? ['--counters', 'on'] : [])],
    { encoding: 'utf8', stdio: 'inherit' });
}
const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'));

const rows = [{ ability: null, smartWinRate: base.smartWinRate, avgRounds: base.avgRounds,
  abilityDamageTotal: base.abilityDamage.__total ?? 0 }];
for (const ability of ABILITIES) {
  const out = execFileSync(process.execPath, ['scripts/tournament.mjs',
    '--games', String(GAMES), '--matchup', 'new-old', '--seed', String(SEED),
    '--ablate', ability, '--budget', '300',
    ...(process.argv.includes('--counters') ? ['--counters', 'on'] : [])], { encoding: 'utf8' });
  const file = new URL(`../reports/tournament_new-old_ablate-${ability}_g${GAMES}${SUFFIX}.json`, import.meta.url);
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  rows.push({ ability, smartWinRate: r.smartWinRate, avgRounds: r.avgRounds,
    abilityDamageTotal: r.abilityDamage.__total ?? 0 });
  console.log(`${ability}: winRate=${r.smartWinRate} (base ${base.smartWinRate}) rounds=${r.avgRounds}`);
}
const summary = { params: { games: GAMES, seed: SEED, matchup: 'new-old', budgetMs: 300, counters: !!SUFFIX },
  base: { smartWinRate: base.smartWinRate, avgRounds: base.avgRounds },
  rows: rows.slice(1).map(r => ({ ...r, delta: +(r.smartWinRate - base.smartWinRate).toFixed(3),
    roundsDelta: +(r.avgRounds - base.avgRounds).toFixed(2) })) };
fs.writeFileSync(new URL(`../reports/ablation_summary${SUFFIX}.json`, import.meta.url), JSON.stringify(summary, null, 2));
fs.writeFileSync(new URL(`../reports/ablation_summary${SUFFIX}.csv`, import.meta.url),
  'ability,smartWinRate,delta,avgRounds,roundsDelta\n' +
  'null,' + base.smartWinRate + ',0,' + base.avgRounds + ',0\n' +
  summary.rows.map(r => [r.ability, r.smartWinRate, r.delta, r.avgRounds, r.roundsDelta].join(',')).join('\n'));
console.log('ablation_summary.json saved');
