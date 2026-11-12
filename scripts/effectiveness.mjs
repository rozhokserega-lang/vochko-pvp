// Эффективность способностей и контрстихий из агрегатов турнира (Этап 6/8).
// Использование: node scripts/effectiveness.mjs reports/balance/final_new-old_g1000.json [ещё файлы...]
// Выход: reports/balance/ability_effectiveness.csv + counter_effectiveness.csv
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) { console.error('укажите JSON-агрегаты турниров'); process.exit(1); }

const AGG = { dmg: {}, heal: {}, triggers: {}, counterPairs: {}, usage: {} };
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [k, v] of Object.entries(j.abilityDamage ?? {})) if (k !== '__total') AGG.dmg[k] = (AGG.dmg[k] ?? 0) + v;
  for (const [k, v] of Object.entries(j.abilityHeal ?? {})) AGG.heal[k] = (AGG.heal[k] ?? 0) + v;
  for (const [k, v] of Object.entries(j.abilityTriggers ?? {})) AGG.triggers[k] = (AGG.triggers[k] ?? 0) + v;
  for (const [k, v] of Object.entries(j.counterPairs ?? {})) AGG.counterPairs[k] = (AGG.counterPairs[k] ?? 0) + v;
  for (const side of ['a', 'b']) for (const [k, v] of Object.entries(j.elementUsage?.[side] ?? {})) AGG.usage[k] = (AGG.usage[k] ?? 0) + v;
}
const games = Number(process.env.GAMES ?? files.length * 1000);

// Способности: id → {element, role}; активации считаем по effect-ключам.
const rows = [];
for (const id of Object.keys(AGG.triggers)) {
  const [ability, effect] = id.split('/');
  const count = AGG.triggers[id];
  rows.push({ ability, effect, count, dmg: AGG.dmg[ability] ?? 0, heal: AGG.heal[ability] ?? 0 });
}
const byAbility = {};
for (const r of rows) {
  byAbility[r.ability] ??= { activations: 0, damage: 0, heal: 0, perActivation: 0 };
  byAbility[r.ability].activations += r.count;
  byAbility[r.ability].damage += r.dmg;
  byAbility[r.ability].heal += r.heal;
}
for (const a of Object.values(byAbility)) a.perActivation = a.activations ? +((a.damage + a.heal) / a.activations).toFixed(2) : 0;

const countersBlocked = {};
for (const [pair, n] of Object.entries(AGG.counterPairs)) {
  const canceled = pair.split('->')[1];
  countersBlocked[canceled] = (countersBlocked[canceled] ?? 0) + n;
}

let csv = 'ability,activations,damage,heal,effectPerActivation,counterBlocked,timesPerGame\n';
for (const [ability, s] of Object.entries(byAbility)) {
  csv += [ability, s.activations, s.damage, s.heal, s.perActivation, countersBlocked[ability] ?? 0, (s.activations / games).toFixed(2)].join(',') + '\n';
}
fs.writeFileSync('reports/balance/ability_effectiveness.csv', csv);

let ccsv = 'counterPair,count,timesPerGame\n';
for (const [pair, n] of Object.entries(AGG.counterPairs)) {
  ccsv += [pair, n, (n / games).toFixed(2)].join(',') + '\n';
}
fs.writeFileSync('reports/balance/counter_effectiveness.csv', ccsv);
console.log('reports/balance/ability_effectiveness.csv + counter_effectiveness.csv записаны');
