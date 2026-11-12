// Верификация комбо-баланса (Этап 7): вариантные правила + ablation внутри них.
// Проверяем: (1) комбо против базы; (2) оживают ли мёртвые способности;
// (3) не остались ли чрезмерно сильными топ-способности.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const GAMES = Number(process.argv[2] ?? 300);
const SEED = Number(process.argv[3] ?? 1);

// Кандидат финального баланса (по трендам экспериментов Этапов 3-4):
export const COMBO = {
  fireRetaliation: 'onHit',      // Огонь-защита: оживление
  lavaCounter: 'three',          // Лава-защита: оживление
  steamDampen: 'pct15',          // Пар-защита: оживление
  waterCleanse: 'heal1',         // Вода-защита: нерф сильнейшей
  lavaPierce: 'burnArmor',       // Лава-атака: нерф безусловности
  waterStrip: 'two',             // Вода-атака: лёгкий нерф
  sandstormShield: 'three',      // Буря-защита: нерф доминанты
};

const RUNS = [
  { id: 'combo', label: 'комбо против базы', variants: COMBO },
  { id: 'combo_ablate_fire_retaliation', label: 'комбо: отключить Огонь-ответку', variants: COMBO, ablate: 'fire_retaliation' },
  { id: 'combo_ablate_lava_counter', label: 'комбо: отключить Лава-ответку', variants: COMBO, ablate: 'lava_counter' },
  { id: 'combo_ablate_steam_dampen', label: 'комбо: отключить Пар-защиту', variants: COMBO, ablate: 'steam_dampen' },
  { id: 'combo_ablate_water_cleanse', label: 'комбо: отключить Воду-очищение', variants: COMBO, ablate: 'water_cleanse' },
  { id: 'combo_ablate_lava_pierce', label: 'комбо: отключить Лава-пробой', variants: COMBO, ablate: 'lava_pierce_burn' },
  { id: 'combo_ablate_sandstorm_shield', label: 'комбо: отключить Щит Бури', variants: COMBO, ablate: 'sandstorm_shield' },
];

fs.mkdirSync('reports/balance', { recursive: true });
for (const run of RUNS) {
  const out = `reports/balance/${run.id}_g${GAMES}`;
  console.log('RUN', run.id, '…');
  const args = ['scripts/tournament.mjs', '--games', String(GAMES),
    '--matchup', 'new-old', '--seed', String(SEED), '--budget', '300',
    '--variant', Object.entries(run.variants).map(([k, v]) => `${k}=${v}`).join(','),
    '--out', out];
  if (run.ablate) args.push('--ablate', run.ablate);
  execFileSync(process.execPath, args, { encoding: 'utf8', stdio: 'inherit' });
}
console.log('Комбо-верификация завершена');
