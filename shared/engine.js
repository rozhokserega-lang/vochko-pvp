// Боевой движок «Трёх линий» — портирован 1:1 из legacy_v15.html (fight()/damage()/shield()).
// Сервер — единственный источник расчёта. Укрепление симметрично для обеих сторон
// (в легаси его применял только игрок — расхождение зафиксировано и согласовано в README §3).
import { attackInfo } from './elements.js';

export const OUTER_HP = 12;
export const INNER_HP = 18;
export const NEXUS_HP = 80;
export const MAX_ROUNDS = 45;
export const SHIELD_BY_BREACHES = [0, 40, 70, 100];
export const fortifiedAttack = (power) => Math.round(power * 0.85);
export const fortifiedDefense = (power) => Math.round(power * 1.25);

export const newState = () => ({
  nexus: NEXUS_HP,
  outer: [OUTER_HP, OUTER_HP, OUTER_HP],
  inner: [INNER_HP, INNER_HP, INNER_HP],
  burn: [0, 0, 0],
});

export const breaches = (p) => p.inner.filter((v) => v <= 0).length;
export const shieldPct = (p) => SHIELD_BY_BREACHES[breaches(p)];
export const isOpen = (p, l) => p.outer[l] <= 0 && p.inner[l] <= 0;

// Излишек урона намеренно НЕ переносится на следующую цель.
export function damage(p, l, amount) {
  const remain = amount;
  if (remain <= 0) return;
  if (p.outer[l] > 0) { p.outer[l] = Math.max(0, p.outer[l] - remain); return; }
  if (p.inner[l] > 0) { p.inner[l] = Math.max(0, p.inner[l] - remain); return; }
  p.nexus = Math.max(0, p.nexus - Math.round((remain * shieldPct(p)) / 100));
}

export function damageStage(p, l) {
  return p.outer[l] > 0 ? 'outer' : p.inner[l] > 0 ? 'inner' : 'nexus';
}

export function recordDamage(before, after, l) {
  if (before.outer[l] > 0) return Math.max(0, before.outer[l] - after.outer[l]);
  if (before.inner[l] > 0) return Math.max(0, before.inner[l] - after.inner[l]);
  return Math.max(0, before.nexus - after.nexus);
}

const clone = (p) => ({ nexus: p.nexus, outer: [...p.outer], inner: [...p.inner], burn: [...p.burn] });

// Авторитетный расчёт раунда для двух сессий A/B.
// turnX = { placements: [{lane, attack:[card,card], defense:[card,card]}×3], fortifyLane: null|0|1|2 }.
// Порядок (как в легаси): поджог прошлого раунда → одновременный прямой урон по линиям.
// ADR (симметричное укрепление): сначала модификаторы атаки обеих сторон, затем защиты,
// затем hit пересчитывается один раз — при одиночном укреплении результат совпадает с легаси.
export function resolveRound(state, turnA, turnB) {
  const lanes = [0, 1, 2].map((l) => {
    const A = attackInfo(turnA.placements[l].attack, turnB.placements[l].defense);
    const B = attackInfo(turnB.placements[l].attack, turnA.placements[l].defense);
    if (turnA.fortifyLane === l) A.a = fortifiedAttack(A.a);
    if (turnB.fortifyLane === l) B.a = fortifiedAttack(B.a);
    if (turnA.fortifyLane === l) B.d = fortifiedDefense(B.d);
    if (turnB.fortifyLane === l) A.d = fortifiedDefense(A.d);
    if (turnA.fortifyLane === l) { A.hit = Math.max(0, A.a - A.d); if (A.hit === 0) A.burn = 0; }
    if (turnB.fortifyLane === l) { B.hit = Math.max(0, B.a - B.d); if (B.hit === 0) B.burn = 0; }
    return { A, B };
  });

  const events = [];
  const report = [];
  const cloneA = clone(state.a);
  const cloneB = clone(state.b);

  // 1) Поджог прошлого раунда — сначала и одновременно с обеих сторон.
  for (let l = 0; l < 3; l++) {
    for (const [side, prev] of [['a', cloneA], ['b', cloneB]]) {
      const p = state[side];
      if (!prev.burn[l]) continue;
      const before = clone(p);
      const stage = damageStage(p, l);
      damage(p, l, prev.burn[l]);
      events.push({ side, l, stage, amount: recordDamage(before, p, l), burn: true, element: '🔥' });
    }
  }

  // 2) Прямой урон — одновременно по каждой линии.
  for (let l = 0; l < 3; l++) {
    const beforeA = clone(state.a), beforeB = clone(state.b);
    const stageA = damageStage(state.a, l), stageB = damageStage(state.b, l);
    damage(state.b, l, lanes[l].A.hit); // атака A бьёт B
    damage(state.a, l, lanes[l].B.hit); // атака B бьёт A
    events.push(
      { side: 'b', l, stage: stageB, amount: recordDamage(beforeB, state.b, l), element: lanes[l].A.at },
      { side: 'a', l, stage: stageA, amount: recordDamage(beforeA, state.a, l), element: lanes[l].B.at },
    );
    state.b.burn[l] = lanes[l].A.burn; // поджог на следующий раунд
    state.a.burn[l] = lanes[l].B.burn;
    report.push({
      round: state.round,
      lane: l,
      a: { info: lanes[l].A, attack: turnA.placements[l].attack, defense: turnB.placements[l].defense,
           dealt: recordDamage(beforeB, state.b, l), stage: stageB,
           fortified: turnA.fortifyLane === l, burn: lanes[l].A.burn },
      b: { info: lanes[l].B, attack: turnB.placements[l].attack, defense: turnA.placements[l].defense,
           dealt: recordDamage(beforeA, state.a, l), stage: stageA,
           fortified: turnB.fortifyLane === l, burn: lanes[l].B.burn },
    });
  }

  state.round += 1;
  const aDead = state.a.nexus <= 0, bDead = state.b.nexus <= 0;
  let finished = false, winner = null;
  if (aDead || bDead || state.round - 1 >= MAX_ROUNDS) {
    finished = true;
    winner = aDead && bDead ? 'draw' : bDead ? 'a' : aDead ? 'b' : state.a.nexus > state.b.nexus ? 'a' : state.a.nexus < state.b.nexus ? 'b' : 'draw';
  }
  return { events, report, finished, winner };
}
