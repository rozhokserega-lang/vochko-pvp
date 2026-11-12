// Агрегация экспериментов баланса: парные сравнения variant vs base с ДИ.
// Парность: одинаковые номера партий (gameSeed) в обеих сериях → статистика
// по парным исходам (выиграл вариант / выиграла база / ничья-ничья и т.п.).
import fs from 'node:fs';
import path from 'node:path';

const GAMES = Number(process.argv[2] ?? 300);
const dir = 'reports/balance';

function readGames(file) {
  const csv = fs.readFileSync(file, 'utf8').trim().split('\n').slice(1);
  return csv.map(line => {
    const [seed, , winner, rounds, nexusA, nexusB] = line.split(',');
    return { seed: Number(seed), winner, rounds: Number(rounds), nexusA: Number(nexusA), nexusB: Number(nexusB) };
  });
}

// Парный ключ: номер партии (по порядку) — сиды парные, но различаются между
// конфигами, поэтому матч по индексу строки.
function byIndex(file) { return readGames(file); }

// Точный биномиальный доверительный интервал (Клоппер-Пирсон) для доли.
function ciExact(k, n, alpha = 0.05) {
  if (n === 0) return [0, 1];
  const lo = k === 0 ? 0 : betaInv(alpha / 2, k, n - k + 1);
  const hi = k === n ? 1 : betaInv(1 - alpha / 2, k + 1, n - k);
  return [lo, hi];
}
function betaInv(p, a, b) { // численная инверсия бета-распределения (бисекция по CDF)
  const pdf = (x) => { // лог-плотность через гамма
    const lg = (t) => { let s = 1; for (let i = 2; i <= Math.floor(t); i++) s += Math.log(i); return t <= 1 ? 0 : s; };
    return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - (lg(a + b - 1) - lg(a - 1) - lg(b - 1)));
  };
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    // грубый CDF: численно интегрируем плотность
    let sum = 0; const steps = 400;
    for (let s = 1; s <= steps; s++) sum += pdf((s - 0.5) * mid / steps) * (mid / steps);
    if (sum < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function summarize(games) {
  const wins = { a: 0, b: 0, draw: 0 };
  const rounds = games.map(g => g.rounds).sort((x, y) => x - y);
  for (const g of games) wins[g.winner] = (wins[g.winner] ?? 0) + 1;
  const decided = wins.a + wins.b;
  return {
    wins, decided,
    smartWinRate: decided ? +(wins.a / decided).toFixed(3) : 0,
    smartWinRateAll: +(wins.a / games.length).toFixed(3),
    avgRounds: +(games.reduce((s, g) => s + g.rounds, 0) / games.length).toFixed(2),
    medianRounds: rounds[Math.floor(rounds.length / 2)],
    doubleKill: games.filter(g => g.winner === 'draw').length,
    avgNexusA: +(games.reduce((s, g) => s + g.nexusA, 0) / games.length).toFixed(2),
    avgNexusB: +(games.reduce((s, g) => s + g.nexusB, 0) / games.length).toFixed(2),
  };
}

const experiments = JSON.parse(fs.readFileSync(path.join(dir, 'experiments.json'), 'utf8'));
const base = byIndex(path.join(dir, `base_g${GAMES}.csv`));
const baseSum = summarize(base);
const out = { params: { games: GAMES, note: 'исправленные непересекающиеся сиды (gameSeed)', paired: 'по индексу партии' }, base: baseSum, rows: [] };

for (const exp of experiments) {
  const file = path.join(dir, `${exp.id}_g${GAMES}.csv`);
  if (!fs.existsSync(file)) { console.log('нет файла:', file); continue; }
  const games = byIndex(file);
  const sum = summarize(games);
  // Парная статистика на решённых парах (обе решены, разные победители)
  let vWins = 0, bWins = 0, ties = 0, other = 0;
  for (let i = 0; i < Math.min(games.length, base.length); i++) {
    const wv = games[i].winner, wb = base[i].winner;
    if (wv === wb) ties++; else if (wv !== 'draw' && wb === 'draw') vWins++;
    else if (wv === 'draw' && wb !== 'draw') bWins++;
    else other++;
  }
  const pairs = vWins + bWins; // решённые парами
  const [lo, hi] = ciExact(vWins, pairs);
  out.rows.push({
    id: exp.id, label: exp.label, variants: exp.variants,
    ...sum,
    deltaWR: +((sum.smartWinRate - baseSum.smartWinRate) * 100).toFixed(1),
    paired: { variantWins: vWins, baseWins: bWins, sameOutcome: ties, crossType: other,
      pairWinRate: pairs ? +(vWins / pairs).toFixed(3) : null, ci95: [+(lo * 100).toFixed(1), +(hi * 100).toFixed(1)] },
    avgRoundsDelta: +(sum.avgRounds - baseSum.avgRounds).toFixed(2),
  });
}

fs.writeFileSync(path.join(dir, 'experiments_summary.json'), JSON.stringify(out, null, 2));
const csv = 'id,smartWinRate,deltaWR,avgRounds,roundsDelta,pairWinRate,ciLo,ciHi,decided,draws\n' +
  out.rows.map(r => [r.id, r.smartWinRate, r.deltaWR, r.avgRounds, r.avgRoundsDelta,
    r.paired.pairWinRate ?? '', r.paired.ci95?.[0] ?? '', r.paired.ci95?.[1] ?? '', r.decided, r.wins.draw].join(',')).join('\n');
fs.writeFileSync(path.join(dir, 'balance_comparison.csv'), csv);
console.log('Сводка: reports/balance/experiments_summary.json + balance_comparison.csv');
for (const r of out.rows) {
  const ci = r.paired.ci95 ?? ['?'];
  const sig = ci[0] > 50 || ci[1] < 50 ? 'ЗНАЧИМО' : 'в шуме';
  console.log(`${r.id.padEnd(28)} WR ${r.smartWinRate} (Δ${r.deltaWR > 0 ? '+' : ''}${r.deltaWR}) пары ${r.paired.pairWinRate} CI[${ci[0]}..${ci[1]}] ${sig} | rounds ${r.avgRounds} (${r.avgRoundsDelta >= 0 ? '+' : ''}${r.avgRoundsDelta})`);
}
console.log(`База: WR ${baseSum.smartWinRate} rounds ${baseSum.avgRounds} ничьих ${baseSum.wins.draw}`);
