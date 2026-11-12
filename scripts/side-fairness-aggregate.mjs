// Агрегация side-fairness шардов: общий firstMoverWinRate с ДИ Уилсона.
// Использование: node scripts/side-fairness-aggregate.mjs reports/balance/sidefair_*.json
import fs from 'node:fs';

const files = process.argv.slice(2).filter(f => fs.existsSync(f));
const groups = {};
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const key = j.summary.matchup + (Object.keys(j.summary.variants ?? {}).length ? '+variant' : '');
  (groups[key] ??= { games: 0, fmW: 0, draws: 0, roundsSum: 0, parts: [] }).games += j.summary.games;
  groups[key].fmW += j.summary.firstMoverWins ?? Math.round(j.summary.firstMoverWinRate * (j.summary.games - j.summary.draws));
  groups[key].draws += j.summary.draws;
  groups[key].roundsSum += j.summary.avgRounds * j.summary.games;
  groups[key].parts.push(f);
}
for (const [key, g] of Object.entries(groups)) {
  const decided = g.games - g.draws;
  const p = g.fmW / decided, z = 1.96, n = decided;
  const den = 1 + z * z / n, c = (p + z * z / (2 * n)) / den;
  const half = z * Math.sqrt((p * (1 - p)) / n + z * z / (4 * n * n)) / den;
  const lo = (Math.max(0, c - half) * 100).toFixed(1), hi = (Math.min(1, c + half) * 100).toFixed(1);
  const sig = Math.abs(p - 0.5) * n > 0 ? (lo > 50 || hi < 50) : false;
  console.log(`${key}: игр ${g.games}, ничьих ${g.draws} (${(g.draws / g.games * 100).toFixed(1)}%), ср.длина ${(g.roundsSum / g.games).toFixed(2)}`);
  console.log(`  побед первого ходока: ${g.fmW}/${decided} = ${(p * 100).toFixed(1)}% CI95 [${lo}..${hi}] — ${sig ? 'ПРЕИМУЩЕСТВО СТОРОНЫ' : 'без значимого преимущества стороны'}`);
}
