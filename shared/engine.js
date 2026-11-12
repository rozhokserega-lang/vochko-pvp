import { lineStats, type, elementOf } from './elements.js';
import {
  applyStatuses, effectiveLine, hitConsequences, ensureStatuses, emptyStatuses,
} from './abilities.js';

// Атакующая пара бьёт, защитная поглощает удар. Все линии одновременны.
// Единый движок: сервер, клиент-предпросмотр, бот и симулятор используют эти
// функции. Способности включаются флагом opts.abilities (по умолчанию выкл —
// точное сохранение прежнего PvP-баланса; старые матчи в БД не затрагиваются).
export const OUTER_HP = 12;
export const INNER_HP = 18;
export const NEXUS_HP = 80;
export const MAX_ROUNDS = 45;
export const SHIELD_BY_BREACHES = [0, 40, 70, 100];

export const newBoard = () => ({
  nexus: NEXUS_HP,
  outer: [OUTER_HP, OUTER_HP, OUTER_HP],
  inner: [INNER_HP, INNER_HP, INNER_HP],
  burn: [0, 0, 0],
  statuses: emptyStatuses(),
});

// Совместимость: newState исторически возвращает доску одной стороны.
export const newState = newBoard;

// Полное состояние матча: обе стороны + счётчик раундов.
export const createGameState = () => ({ round: 1, a: newBoard(), b: newBoard() });

// Безопасное копирование состояния для симуляций (без побочных эффектов).
export const cloneGameState = (state) =>
  typeof structuredClone === 'function' ? structuredClone(state) : JSON.parse(JSON.stringify(state));

export const breaches = (p) => p.inner.filter((v) => v <= 0).length;
export const shieldPct = (p) => SHIELD_BY_BREACHES[breaches(p)];
export const isOpen = (p, l) => p.outer[l] <= 0 && p.inner[l] <= 0;

// Излишек урона намеренно НЕ переносится на следующую цель.
export function damage(p, l, amount, nexusPct = shieldPct(p)) {
  const remain = amount;
  if (remain <= 0) return;
  if (p.outer[l] > 0) { p.outer[l] = Math.max(0, p.outer[l] - remain); return; }
  if (p.inner[l] > 0) { p.inner[l] = Math.max(0, p.inner[l] - remain); return; }
  p.nexus = Math.max(0, p.nexus - Math.round((remain * nexusPct) / 100));
}

export function damageStage(p, l) {
  return p.outer[l] > 0 ? 'outer' : p.inner[l] > 0 ? 'inner' : 'nexus';
}

// Легковесный снимок цели (достаточно recordDamage; structuredClone не нужен).
export const snapshotForRecord = (p) => ({ outer: [...p.outer], inner: [...p.inner], nexus: p.nexus });

export function recordDamage(before, after, l) {
  if (before.outer[l] > 0) return Math.max(0, before.outer[l] - after.outer[l]);
  if (before.inner[l] > 0) return Math.max(0, before.inner[l] - after.inner[l]);
  return Math.max(0, before.nexus - after.nexus);
}

// Лечение текущей цели линии с капом по максимуму структуры. Возвращает факт.
export function healStructure(p, l, amount) {
  if (!(amount > 0)) return 0;
  const stage = damageStage(p, l);
  if (stage === 'nexus') {
    if (p.nexus <= 0) return 0;
    const healed = Math.min(NEXUS_HP - p.nexus, amount);
    p.nexus += healed;
    return healed;
  }
  if (p[stage][l] <= 0) return 0;
  const max = stage === 'outer' ? OUTER_HP : INNER_HP;
  const healed = Math.min(max - p[stage][l], amount);
  p[stage][l] += healed;
  return healed;
}

// Допустимые действия/информация о линиях для бота и интерфейса.
export function getLegalActions(state, side = 'a') {
  const board = state[side] ?? state;
  return {
    shieldPct: shieldPct(board),
    lanes: [0, 1, 2].map((l) => {
      const stage = damageStage(board, l);
      return { lane: l, stage, open: isOpen(board, l), hp: stage === 'nexus' ? board.nexus : board[stage][l] };
    }),
  };
}

// Победитель после инкремента state.round (как в resolveRound).
export function getWinner(state) {
  const aDead = state.a.nexus <= 0, bDead = state.b.nexus <= 0;
  const finished = aDead || bDead || state.round - 1 >= MAX_ROUNDS;
  const winner = !finished ? null : aDead && bDead ? 'draw' : bDead ? 'a' : aDead ? 'b'
    : state.a.nexus > state.b.nexus ? 'a' : state.a.nexus < state.b.nexus ? 'b' : 'draw';
  return { finished, winner };
}

const io = {
  damage, damageStage, recordDamage, healStructure, snapshot: snapshotForRecord,
};

// Все характеристики вычисляются до изменения HP; обе стороны бьют даже при смерти.
// Порядок раунда (ТЗ): статусы (очищение/поджог) → защита → атака → расчёт щита →
// урон → последствия попадания → перенос статусов.
export function resolveRound(state, turnA, turnB, opts = {}) {
  const abilities = !!opts.abilities;
  const rng = opts.rng ?? Math.random;
  const disabled = new Set(opts.disabled ?? []);
  const find = (turn, lane) => turn.placements.find(p => p.lane === lane);
  const events = [], report = [], abilityEvents = [];
  // Прорывы этого раунда влияют на Нексус только со следующего раунда.
  const nexusPct = { a: shieldPct(state.a), b: shieldPct(state.b) };
  state.a.burn = [0, 0, 0]; state.b.burn = [0, 0, 0]; // старое поле неактивно

  let ctx = null;
  if (abilities) {
    ensureStatuses(state.a); ensureStatuses(state.b);
    ctx = applyStatuses(state, { turnA, turnB, nexusPct, rng, disabled, events, abilityEvents, io });
  }

  const lanes = [0, 1, 2].map(l => {
    const pa = find(turnA, l), pb = find(turnB, l);
    return { pa, pb, a: lineStats(pa), b: lineStats(pb) };
  });

  for (let l = 0; l < 3; l++) {
    const { pa, pb, a, b } = lanes[l];
    const entry = (own, opp, ownCards, oppCards, target, side) => {
      const attackerSide = side === 'b' ? 'a' : 'b'; // side — получающая удар сторона
      let ownAtk = own.attack, oppDef = opp.defense, atkElement, defElement, mods = null;
      if (abilities) {
        atkElement = elementOf(ownCards.attack)?.id;
        defElement = elementOf(oppCards.defense)?.id;
        mods = effectiveLine({ ctx, attackerSide, lane: l, atkStat: own.attack, defStat: opp.defense, atkElement, defElement });
        ownAtk = mods.attack; oppDef = mods.defense;
      }
      const info = { a: ownAtk, d: oppDef,
        baseA: own.baseAttack, baseD: opp.baseDefense,
        hit: abilities ? mods.hit : Math.max(0, own.attack - opp.defense), burn: 0, match: '',
        at: type(ownCards.attack), dt: type(oppCards.defense),
        pairs: own.pairs, opponentPairs: opp.pairs };
      if (abilities) { info.atkElement = atkElement; info.defElement = defElement; info.armorStripped = mods.armorStripped; }
      const before = snapshotForRecord(target), stage = damageStage(target, l);
      damage(target, l, info.hit, nexusPct[side]);
      const dealt = recordDamage(before, target, l);
      events.push({ side, l, stage, amount: dealt, element: info.at,
        elements: [own.pairs[0].element] });
      if (abilities) {
        hitConsequences({ ctx, state, attackerSide, lane: l, atkElement, defElement, hit: info.hit, rng });
      }
      return { info, attack: ownCards.attack, defense: oppCards.defense,
        ownPairs: [ownCards.attack, ownCards.defense],
        opponentPairs: [oppCards.attack, oppCards.defense],
        dealt, stage, fortified: false, burn: 0 };
    };
    report.push({ round: state.round, lane: l,
      a: entry(a, b, pa, pb, state.b, 'b'),
      b: entry(b, a, pb, pa, state.a, 'a') });
  }

  if (abilities) { // перенос статусов на следующий раунд
    state.a.statuses = ctx.next.a;
    state.b.statuses = ctx.next.b;
  }

  state.round += 1;
  const { finished, winner } = getWinner(state);
  return {
    events, report,
    ...(abilities ? { abilityEvents } : {}),
    finished, winner,
  };
}
