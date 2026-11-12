// Параллельный запуск серий турниров (12 логических ядер — по процессу на ядро).
// Манифест: JSON-массив [{ name, args: [...] }] — аргументы для node scripts/tournament.mjs.
// Использование: node scripts/parallel-runs.mjs <manifest.json> [concurrency]
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const manifestPath = process.argv[2];
const concurrency = Number(process.argv[3] ?? 8);
const jobs = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const t0 = Date.now();
let index = 0, done = 0, failed = 0;
const results = [];

function next() {
  if (index >= jobs.length) return null;
  const job = jobs[index++];
  const script = job.script ?? 'scripts/tournament.mjs';
  const child = spawn(process.execPath, [script, ...job.args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', d => out += d);
  child.stderr.on('data', d => out += d);
  child.on('exit', code => {
    results.push({ name: job.name, code, out });
    done++;
    console.log(`[${done}/${jobs.length}] ${job.name}: ${code === 0 ? 'ok' : 'FAIL(' + code + ')'}`);
    const m = out.match(/smartWinRate=([\d.]+) wins a\/b\/draw=([\d/]+)/);
    if (m) console.log(`   ${job.name}: WR ${m[1]} wins ${m[2]}`);
    next();
  });
  return child;
}
for (let i = 0; i < Math.min(concurrency, jobs.length); i++) { if (!next()) break; }
const timer = setInterval(() => {
  if (done >= jobs.length) {
    clearInterval(timer);
    console.log(`Все серии завершены за ${((Date.now() - t0) / 1000).toFixed(0)} с; провалено: ${failed}`);
    fs.writeFileSync('reports/balance/parallel-runs-log.json', JSON.stringify(results.map(r => ({ name: r.name, code: r.code })), null, 2));
    if (failed) process.exit(1);
  }
}, 500);
// подсчёт провалов
const origPush = results.push.bind(results);
results.push = v => { if (v.code !== 0) failed++; return origPush(v); };
