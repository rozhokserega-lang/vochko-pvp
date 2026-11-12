// Эксперименты баланса (Этапы 3-4): каждый вариант против исходного баланса.
// Парные сиды (gameSeed) — прямое сравнение variant vs base по тем же номерам партий.
// Результаты: reports/balance/*.json|csv + сводка reports/balance/experiments.json
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GAMES = Number(process.argv[2] ?? 300);
const SEED = Number(process.argv[3] ?? 1);
const ONLY = process.argv.find(a => a.startsWith('--only='))?.slice(7) ?? null;

// A/B/C-варианты из ТЗ (исходный баланс = A, тестируются B/C)
const EXPERIMENTS = [
  { id: 'fire_retaliation_onhit', label: 'Огонь-защита B: ответка 2 при попадании в щит', variants: { fireRetaliation: 'onHit' } },
  { id: 'fire_retaliation_blocked3', label: 'Огонь-защита C: ответка 3 при полной блокировке', variants: { fireRetaliation: 'blocked3' } },
  { id: 'lava_counter_three', label: 'Лава-защита B: ответка 3', variants: { lavaCounter: 'three' } },
  { id: 'lava_counter_stronghit', label: 'Лава-защита C: ответка при ударе ≥3', variants: { lavaCounter: 'strongHit' } },
  { id: 'steam_dampen_pct15', label: 'Пар-защита B: −15% входящего урона', variants: { steamDampen: 'pct15' } },
  { id: 'steam_dampen_healpartial', label: 'Пар-защита C: лечение при слабом ударе (≤2)', variants: { steamDampen: 'healPartial' } },
  { id: 'water_cleanse_heal1', label: 'Вода-защита B: лечение 1 HP', variants: { waterCleanse: 'heal1' } },
  { id: 'water_cleanse_single', label: 'Вода-защита C: очищение одного статуса', variants: { waterCleanse: 'single' } },
  { id: 'lava_pierce_pct5', label: 'Лава-атака B: пробой 5%', variants: { lavaPierce: 'pct5' } },
  { id: 'lava_pierce_burnarmor', label: 'Лава-атака C: поджог только при броне', variants: { lavaPierce: 'burnArmor' } },
  { id: 'water_strip_two', label: 'Вода-атака B: снять до 2 брони', variants: { waterStrip: 'two' } },
  { id: 'sandstorm_shield_three', label: 'Буря-защита B: щит +3', variants: { sandstormShield: 'three' } },
];

const list = ONLY ? EXPERIMENTS.filter(e => e.id === ONLY) : EXPERIMENTS;
fs.mkdirSync('reports/balance', { recursive: true });

// База (исходный баланс) на исправленных сидах — якорь сравнения.
const baseFile = path.join('reports/balance', `base_g${GAMES}.json`);
if (!fs.existsSync(baseFile)) {
  console.log('BASE (исходный баланс, исправленные сиды)…');
  execFileSync(process.execPath, ['scripts/tournament.mjs', '--games', String(GAMES),
    '--matchup', 'new-old', '--seed', String(SEED), '--budget', '300',
    '--out', 'reports/balance/base_g' + GAMES], { encoding: 'utf8', stdio: 'inherit' });
}

const rows = [];
for (const exp of list) {
  const out = `reports/balance/${exp.id}_g${GAMES}`;
  console.log('VARIANT', exp.id, '…');
  execFileSync(process.execPath, ['scripts/tournament.mjs', '--games', String(GAMES),
    '--matchup', 'new-old', '--seed', String(SEED), '--budget', '300',
    '--variant', Object.entries(exp.variants).map(([k, v]) => `${k}=${v}`).join(','),
    '--out', out], { encoding: 'utf8', stdio: 'inherit' });
  // турнир пишет по своему шаблону имени; найдём свежий json
  const produced = fs.readdirSync('reports').filter(f => f.startsWith('tournament_new-old') && f.includes('_g' + GAMES) && f.endsWith('.json'));
  console.log('  →', exp.label, 'готово');
  rows.push(exp.id);
}
console.log('Все эксперименты завершены. Агрегация — scripts/balance-aggregate.mjs');
