// Тесты 20 стихийных способностей, статусов и совместимости движка.
// Порядок раунда по ТЗ: защита → атака → расчёт щита → урон → последствия → перенос.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from './helpers.js';
import { ABILITIES, COUNTERS, counterOf, STATUS_CAPS } from '../shared/abilities.js';
import * as E from '../shared/engine.js';
import { mulberry32 } from '../shared/rng.js';
import { deal } from '../shared/cards.js';
import { botPlan } from '../shared/bot.js';
import { resolveRound as legacyResolve, newState as legacyNewState } from './legacy-round-reference.js';

// ── Таблица способностей ───────────────────────────────────────────────────
test('таблица: 10 стихий × 2 роли = 20 способностей, контр-таблица направленная', () => {
  assert.equal(Object.keys(ABILITIES).length, 20);
  const byElement = {};
  for (const a of Object.values(ABILITIES)) byElement[a.element] = (byElement[a.element] ?? 0) + 1;
  assert.equal(Object.keys(byElement).length, 10);
  assert.ok(Object.values(byElement).every(n => n === 2));
  // Направленность: Огонь контрится Водой, но Вода контрится Грозой (не взаимно).
  assert.equal(counterOf('fire'), 'water');
  assert.equal(counterOf('water'), 'thunderstorm');
  assert.equal(Object.keys(COUNTERS).length, 10);
});

// ── Фикстуры ───────────────────────────────────────────────────────────────
// Сильная пара A+K по мастям стихии: base 38.
const STRONG = {
  fire: [C('♥','A'), C('♥','K')],        // atk 46 / def 34
  water: [C('♦','A'), C('♦','K')],       // 42 / 42
  earth: [C('♠','A'), C('♠','K')],       // 36 / 48
  air: [C('♣','A'), C('♣','K')],         // 40 / 44
  steam: [C('♥','A'), C('♦','K')],       // 42 / 42
  lava: [C('♥','A'), C('♠','K')],        // 46 / 36
  fire_vortex: [C('♥','A'), C('♣','K')], // 44 / 38
  ice: [C('♦','A'), C('♠','K')],         // 38 / 46
  thunderstorm: [C('♦','A'), C('♣','K')],// 44 / 40
  sandstorm: [C('♠','A'), C('♣','K')],   // 40 / 44
};
// Слабые вспомогательные пары.
const F = {
  wFire: [C('♥','2'), C('♥','2')],      // atk 7 / def 5
  wWater: [C('♦','2'), C('♦','2')],     // atk 7 / def 7
  earthDef: [C('♠','5'), C('♠','6')],   // def 19
  fireDef: [C('♥','5'), C('♥','6')],    // def 14
  airDef: [C('♣','5'), C('♣','6')],     // def 17
  steamDef: [C('♥','5'), C('♦','6')],   // def 17
};
// Защита по умолчанию на тестовой линии у атакующей стороны: Земля, def 16.
const ADEF = [C('♠','4'), C('♠','5')];
// Наполнители линий 0/2: Земля, взаимные удары = 0, идентичны у обеих сторон.
const FILL0A = [C('♠','2'), C('♠','3')], FILL0D = [C('♠','5'), C('♠','6')];
const FILL2A = [C('♠','7'), C('♠','8')], FILL2D = [C('♠','9'), C('♠','10')];
// Слабая атака B: Лёд 6 — не пробивает ни одну защиту фикстур (hit 0, без on-hit).
const Zweak = [C('♦','2'), C('♠','2')]; // ice: atk 6

const placement = (lane, attack, defense) => ({ lane, attack, defense });
const freshState = () => ({ round: 1, a: E.newState(), b: E.newState() });
const row1 = (report) => report[1]; // тестовая линия

// A бьёт X по защите Y; атака B слабая (hit 0).
function attackFixture(X, Y) {
  const state = freshState();
  const tA = { placements: [placement(0, FILL0A, FILL0D), placement(1, X, ADEF), placement(2, FILL2A, FILL2D)] };
  const tB = { placements: [placement(0, FILL0A, FILL0D), placement(1, Zweak, Y), placement(2, FILL2A, FILL2D)] };
  return { state, tA, tB };
}

// A защищается W, B бьёт Z; атака A слабая (hit 0 против защиты Земли 48).
function defenseFixture(W, Z) {
  const state = freshState();
  const tA = { placements: [placement(0, FILL0A, FILL0D), placement(1, F.wWater, W), placement(2, FILL2A, FILL2D)] };
  const tB = { placements: [placement(0, FILL0A, FILL0D), placement(1, Z, STRONG.earth), placement(2, FILL2A, FILL2D)] };
  return { state, tA, tB };
}

// ── Атакующие способности ──────────────────────────────────────────────────
test('Огонь (атака): при попадании поджог 2 на следующий раунд', () => {
  const { state, tA, tB } = attackFixture(STRONG.fire, F.airDef); // 46 vs 17 → 29
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(row1(r.report).a.dealt, 12); // внешний уничтожен
  assert.equal(state.b.statuses[1].burn, 2);
  assert.equal(state.a.statuses[1].burn, undefined); // поджог только у жертвы
});

test('Вода (атака): снимает до 3 временной брони перед уроном', () => {
  const { state, tA, tB } = attackFixture(STRONG.water, F.fireDef); // 42
  state.b.statuses[1] = { armor: 3 };
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  // защита: 14 + 3 брони = 17 → Вода снимает 3 → 14 → hit 28
  assert.equal(row1(r.report).a.info.d, 14);
  assert.equal(row1(r.report).a.info.armorStripped, 3);
  assert.equal(row1(r.report).a.info.hit, 28);
  // без брони — ничего не снимает
  const f2 = attackFixture(STRONG.water, F.fireDef);
  const r2 = E.resolveRound(f2.state, f2.tA, f2.tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(row1(r2.report).a.info.armorStripped, 0);
  assert.equal(row1(r2.report).a.info.hit, 28);
});

test('Земля (атака): игнорирует 15% защиты', () => {
  const { state, tA, tB } = attackFixture(STRONG.earth, F.airDef); // 36 vs 17
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(row1(r.report).a.info.d, Math.round(17 * 0.85)); // 14
  assert.equal(row1(r.report).a.info.hit, 36 - 14);
});

test('Воздух (атака): при попадании ослабляет следующую защиту на 10%', () => {
  const { state, tA, tB } = attackFixture(STRONG.air, F.fireDef); // 40 vs 14
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(row1(r.report).a.dealt, 12);
  assert.equal(state.b.statuses[1].weakenDefense, 10);
});

test('Пар (атака): при попадании ослабляет следующую защиту на 15%', () => {
  const { state, tA, tB } = attackFixture(STRONG.steam, F.fireDef); // 42 vs 14
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(state.b.statuses[1].weakenDefense, 15);
});

test('Лава (атака): пробивает 10% защиты и поджигает на 1', () => {
  const { state, tA, tB } = attackFixture(STRONG.lava, F.airDef); // 46 vs 17
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(row1(r.report).a.info.d, Math.round(17 * 0.9)); // 15
  assert.equal(row1(r.report).a.info.hit, 46 - 15);
  assert.equal(state.b.statuses[1].burn, 1);
});

test('Огненный вихрь (атака): по 1 поджогу на соседние линии', () => {
  const { state, tA, tB } = attackFixture(STRONG.fire_vortex, F.fireDef); // 44 vs 14
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(state.b.statuses[0].burn, 1);
  assert.equal(state.b.statuses[2].burn, 1);
  assert.equal(state.b.statuses[1].burn, undefined);
});

test('Лёд (атака): при попадании ослабляет следующую защиту на 10%', () => {
  const { state, tA, tB } = attackFixture(STRONG.ice, F.fireDef); // 38 vs 14
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(state.b.statuses[1].weakenDefense, 10);
});

test('Гроза (атака): 2 доп. урона случайной другой башне, детерминированный rng', () => {
  const { state, tA, tB } = attackFixture(STRONG.thunderstorm, F.fireDef); // 44 vs 14
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: () => 0.99 }); // выберет линию 2
  const extra = r.events.filter(e => e.extra && e.side === 'b');
  assert.equal(extra.length, 1);
  assert.equal(extra[0].l, 2);
  assert.equal(extra[0].amount, 2);
  assert.equal(state.b.outer[2], 10); // 12 − 2
  assert.equal(state.b.outer[0], 12); // линия 0 не тронута
  // повтор с тем же rng — тот же результат
  const f2 = attackFixture(STRONG.thunderstorm, F.fireDef);
  E.resolveRound(f2.state, f2.tA, f2.tB, { abilities: true, rng: () => 0.99 });
  assert.equal(f2.state.b.outer[2], 10);
});

test('Песчаная буря (атака): при попадании ослабляет следующую атаку на 15%', () => {
  const { state, tA, tB } = attackFixture(STRONG.sandstorm, F.fireDef); // 40 vs 14
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(state.b.statuses[1].weakenAttack, 15);
});

test('Способности «при попадании» не срабатывают при ударе 0', () => {
  const weak = {
    fire: F.wFire, water: F.wWater, air: [C('♣','2'), C('♣','2')],
    steam: [C('♥','2'), C('♦','2')], ice: Zweak, sandstorm: [C('♠','2'), C('♣','2')],
    thunderstorm: [C('♦','2'), C('♣','2')], fire_vortex: [C('♥','2'), C('♣','2')],
    lava: [C('♥','2'), C('♠','2')],
  };
  for (const [element, pair] of Object.entries(weak)) {
    const { state, tA, tB } = attackFixture(pair, F.fireDef); // atk ≤ 8 vs 14 → 0
    const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
    assert.equal(row1(r.report).a.info.hit, 0, element);
    assert.deepEqual(state.b.statuses[1], {}, element + ': статусы не выставлены');
  }
});

// ── Защитные способности ───────────────────────────────────────────────────
test('Огонь (защита): полная блокировка → 2 ответного урона атакующему', () => {
  const { state, tA, tB } = defenseFixture(STRONG.fire, F.wFire); // 7 vs 34 → 0
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(row1(r.report).b.info.hit, 0);
  assert.equal(state.b.outer[1], 10); // атакующий B получил 2
  assert.equal(state.a.outer[1], 12);
  const refl = r.events.filter(e => e.extra && e.side === 'b' && e.l === 1);
  assert.equal(refl.length, 1);
  assert.equal(refl[0].amount, 2);
});

test('Вода (защита): очищает негативные статусы до тика поджога и до применения', () => {
  const { state, tA, tB } = defenseFixture(STRONG.water, F.wFire);
  state.a.statuses[1] = { burn: 2, weakenAttack: 15 };
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(state.a.outer[1], 12); // поджог очищен — тика нет
  assert.ok(r.abilityEvents.some(e => e.ability === 'water_cleanse' && e.effect === 'cleanse'
    && e.removed.join() === 'burn,weakenAttack'));
  // очищение до применения: атака A (7) НЕ ослаблена → info.a = 7, а не 6
  assert.equal(row1(r.report).a.info.a, 7);
  assert.deepEqual(state.a.statuses[1], {});
});

test('Вода (защита): нет негативных статусов → восстановление 2 HP', () => {
  const { state, tA, tB } = defenseFixture(STRONG.water, F.wFire);
  state.a.outer[1] = 10;
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(state.a.outer[1], 12);
  assert.ok(r.abilityEvents.some(e => e.ability === 'water_cleanse' && e.effect === 'heal' && e.amount === 2));
});

test('Земля (защита): переносит 3 брони на следующий раунд', () => {
  const { state, tA, tB } = defenseFixture(STRONG.earth, F.wFire);
  E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(state.a.statuses[1].armor, 3);
});

test('Воздух (защита): полная блокировка → отражение 2 урона атакующему', () => {
  const { state, tA, tB } = defenseFixture(STRONG.air, F.wFire); // 7 vs 44 → 0
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(state.b.outer[1], 10);
  assert.equal(state.a.outer[1], 12);
});

test('Пар (защита): входящий урон −10%; при полной блокировке +2 HP', () => {
  const { state, tA, tB } = defenseFixture(F.steamDef, STRONG.fire); // 46 vs 14 → 32 → ×0.9 = 29
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(row1(r.report).b.info.hit, 29);
  assert.equal(state.a.outer[1], 0);
  const f2 = defenseFixture(F.steamDef, F.wFire); // 7 vs 14 → 0
  f2.state.a.outer[1] = 10;
  E.resolveRound(f2.state, f2.tA, f2.tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(f2.state.a.outer[1], 12); // лечение 2
});

test('Лава (защита): при успешном ударе противника 2 ответного урона', () => {
  const { state, tA, tB } = defenseFixture(STRONG.lava, STRONG.fire); // 46 vs 36 → 10
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(row1(r.report).b.info.hit, 10);
  assert.equal(state.a.outer[1], 2); // 12 − 10 удара
  assert.equal(state.b.outer[1], 10); // атакующий получил 2
});

test('Огненный вихрь (защита): −10% входящей атаки при горящей соседней линии', () => {
  const { state, tA, tB } = defenseFixture(STRONG.fire_vortex, STRONG.fire); // 46 vs 38
  state.a.statuses[0] = { burn: 1 };
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  // тик поджога линии 0: 12 → 11; заслон: 46×0.9=41.4→41; hit 41−38=3
  assert.equal(state.a.outer[0], 11);
  assert.equal(row1(r.report).b.info.hit, 3);
  const f2 = defenseFixture(STRONG.fire_vortex, STRONG.fire);
  const r2 = E.resolveRound(f2.state, f2.tA, f2.tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(row1(r2.report).b.info.hit, 46 - 38); // без горящей соседней — полный удар
});

test('Лёд (защита): ослабляет следующую атаку противника на 15%', () => {
  const { state, tA, tB } = defenseFixture(STRONG.ice, STRONG.fire); // 46 vs 46 → 0
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(state.b.statuses[1].weakenAttack, 15);
});

test('Гроза (защита): при атаке противника +2 к следующей своей атаке', () => {
  const { state, tA, tB } = defenseFixture(STRONG.thunderstorm, STRONG.fire); // 46 vs 40 → 6
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(row1(r.report).b.info.hit, 6);
  assert.equal(state.a.statuses[1].attackBoost, 2);
});

test('Песчаная буря (защита): +4 щита на текущий раунд', () => {
  const { state, tA, tB } = defenseFixture(STRONG.sandstorm, STRONG.fire); // 46 vs 44+4=48 → 0
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(row1(r.report).b.info.d, 48);
  assert.equal(row1(r.report).b.info.hit, 0);
});

// ── Жизненный цикл статусов ────────────────────────────────────────────────
test('Поджог: тик в начале следующего раунда, затем гаснет', () => {
  const state = freshState();
  state.a.statuses[1] = { burn: 2 };
  state.b.statuses[1] = { burn: 2 };
  const mk = () => ({ placements: [placement(0, FILL0A, FILL0D), placement(1, F.wWater, F.earthDef), placement(2, FILL2A, FILL2D)] });
  const r = E.resolveRound(state, mk(), mk(), { abilities: true, rng: mulberry32(1) });
  assert.equal(state.a.outer[1], 10); // тик 2
  assert.equal(state.b.outer[1], 10);
  assert.ok(r.events.some(e => e.burnTick && e.side === 'a' && e.amount === 2));
  E.resolveRound(state, mk(), mk(), { abilities: true, rng: mulberry32(2) });
  assert.equal(state.a.outer[1], 10); // второй раунд: поджог погас
});

test('Ослабления применяются один раунд и стираются; капы не дают накапливаться', () => {
  const state = freshState();
  state.a.statuses[1] = { weakenDefense: STATUS_CAPS.weakenDefense, weakenAttack: 30, attackBoost: 6, armor: 9, burn: 5 };
  const tA = { placements: [placement(0, FILL0A, FILL0D), placement(1, STRONG.fire, F.earthDef), placement(2, FILL2A, FILL2D)] };
  const tB = { placements: [placement(0, FILL0A, FILL0D), placement(1, F.wWater, F.fireDef), placement(2, FILL2A, FILL2D)] };
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  // тик поджога A: 12 → 7
  assert.equal(state.a.outer[1], 7);
  // атака Огня: (46+6)×0.7 = 36.4 → 36; защита B без статусов: 14
  assert.equal(row1(r.report).a.info.a, 36);
  assert.equal(row1(r.report).a.info.d, 14);
  // защита A: 19×0.7=13.3→13 + 9 брони = 22; атака B — Вода: снимает 3 брони → 19
  assert.equal(row1(r.report).b.info.d, 19);
  assert.equal(row1(r.report).b.info.armorStripped, 3);
  // поджог Огня на B: max(нет, 2) = 2
  assert.equal(state.b.statuses[1].burn, 2);
  // статусы A стёрты; Земля в защите выставила броню 3
  assert.deepEqual(state.a.statuses[1], { armor: 3 });
});

test('Вода (защита): при негативных статусах лечение не происходит', () => {
  const { state, tA, tB } = defenseFixture(STRONG.water, F.wFire);
  state.a.outer[1] = 10;
  state.a.statuses[1] = { weakenDefense: 10 };
  E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(state.a.outer[1], 10); // очищение вместо лечения
});

test('буст и ослабление атаки применяются в начале следующего раунда', () => {
  const state = freshState();
  state.a.statuses[1] = { attackBoost: 2, weakenAttack: 15 };
  const tA = { placements: [placement(0, FILL0A, FILL0D), placement(1, STRONG.fire, F.earthDef), placement(2, FILL2A, FILL2D)] };
  const tB = { placements: [placement(0, FILL0A, FILL0D), placement(1, F.wFire, F.fireDef), placement(2, FILL2A, FILL2D)] };
  const r = E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  // (46+2)×0.85 = 40.8 → 41 (буст до ослабления)
  assert.equal(row1(r.report).a.info.a, 41);
});

// ── Нексус и одновременное уничтожение ─────────────────────────────────────
test('Нексус: щит по пробитым линиям на начало раунда; новый прорыв — со следующего', () => {
  const state = freshState();
  state.a.outer = [0, 0, 0]; state.a.inner = [5, 0, 0]; // пробиты линии 1,2 → 70%
  const tA = { placements: [placement(0, F.wFire, ADEF), placement(1, F.wFire, ADEF), placement(2, FILL2A, FILL2D)] };
  const tB = { placements: [placement(0, STRONG.air, F.wFire), placement(1, STRONG.air, F.wFire), placement(2, FILL2A, FILL2D)] };
  E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  // B бьёт линию 0: 40−16=24 → внутренняя 5 → 0 (прорыв этого раунда)
  assert.equal(state.a.inner[0], 0);
  // B бьёт линию 1 (открыта): 24 × 70% = 16.8 → 17; НОВЫЙ прорыв линии 0 ещё не в щите
  assert.equal(state.a.nexus, 80 - 17);
  assert.equal(E.shieldPct(state.a), 100); // 3 пробитых — со следующего раунда
});

test('Нексус: урон по открытой линии идёт с процентом щита на начало раунда', () => {
  const state = freshState();
  state.b.outer = [0, 0, 0]; state.b.inner = [0, 0, 18]; // 1 пробитая → 40%
  const wFireDef = [C('♥','3'), C('♥','3')]; // огонь, def 5
  const tA = { placements: [placement(0, F.wWater, STRONG.earth), placement(1, F.wWater, STRONG.earth), placement(2, STRONG.earth, F.wWater)] };
  const tB = { placements: [placement(0, F.wFire, FILL0D), placement(1, F.wFire, FILL0D), placement(2, F.wFire, wFireDef)] };
  E.resolveRound(state, tA, tB, { abilities: true, rng: mulberry32(1) });
  // линии 0/1: защита Земли 48 → hit 0; линия 2: 36−4(×0.85 от 5)=32 → внутренняя 18 → 0, излишек сгорает
  assert.equal(state.b.inner[2], 0);
  assert.equal(state.b.nexus, 80);
});

test('Одновременная смерть обоих Нексусов — ничья', () => {
  const state = freshState();
  for (const side of [state.a, state.b]) { side.outer = [0, 0, 0]; side.inner = [0, 0, 0]; side.nexus = 20; }
  const atk = STRONG.earth; // атака 36
  const mk = () => ({ placements: [placement(0, atk, F.wFire), placement(1, atk, F.wFire), placement(2, atk, F.wFire)] });
  const r = E.resolveRound(state, mk(), mk(), { abilities: true, rng: mulberry32(1) });
  assert.equal(r.finished, true);
  assert.equal(r.winner, 'draw');
});

// ── API движка ─────────────────────────────────────────────────────────────
test('createGameState/cloneGameState/getLegalActions/getWinner', () => {
  const s = E.createGameState();
  assert.equal(s.round, 1);
  assert.deepEqual(s.a.statuses, [{}, {}, {}]);
  const c = E.cloneGameState(s);
  c.a.nexus = 1;
  assert.equal(s.a.nexus, 80);
  const legal = E.getLegalActions(s, 'a');
  assert.deepEqual(legal.lanes.map(l => l.stage), ['outer', 'outer', 'outer']);
  assert.equal(legal.shieldPct, 0);
  s.a.nexus = 0;
  assert.deepEqual(E.getWinner(s), { finished: true, winner: 'b' });
  assert.equal(E.getWinner(E.createGameState()).finished, false);
});

test('abilities=false: поле abilityEvents отсутствует, статусы не мутируются', () => {
  const f = attackFixture(STRONG.fire, F.fireDef);
  const r = E.resolveRound(f.state, f.tA, f.tB);
  assert.equal(r.abilityEvents, undefined);
  assert.deepEqual(f.state.b.statuses, [{}, {}, {}]); // статусы остались пустыми
  assert.equal(f.state.b.outer[1], 0);
});

// ── Детерминизм и симметрия ────────────────────────────────────────────────
test('детерминизм: одинаковый seed → идентичные 3 раунда', () => {
  const run = () => {
    const rng = mulberry32(777);
    const state = E.createGameState();
    const snapshots = [];
    for (let round = 0; round < 3; round++) {
      const hA = deal(rng), hB = deal(rng);
      const tA = { placements: botPlan(hA, state.b, state.a) };
      const tB = { placements: botPlan(hB, state.a, state.b) };
      const r = E.resolveRound(state, tA, tB, { abilities: true, rng });
      if (r.finished) break;
      snapshots.push(JSON.stringify(state));
    }
    return snapshots;
  };
  assert.deepEqual(run(), run());
});

test('симметрия: зеркальные ходы дают зеркальный результат', () => {
  const state = freshState();
  const mk = () => ({ placements: [placement(0, STRONG.fire, F.earthDef), placement(1, STRONG.water, STRONG.ice), placement(2, STRONG.steam, F.airDef)] });
  const r = E.resolveRound(state, mk(), mk(), { abilities: true, rng: mulberry32(5) });
  assert.deepEqual(state.a.outer, state.b.outer);
  assert.deepEqual(state.a.inner, state.b.inner);
  assert.deepEqual(state.a.statuses, state.b.statuses);
  assert.deepEqual(state.a.nexus, state.b.nexus);
  assert.ok(r.abilityEvents.every(e => e.amount >= 0));
});

// ── Совместимость с прежним движком (PvP) ──────────────────────────────────
test('инварианс: abilities=false даёт результаты, идентичные эталону main', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const rng = mulberry32(seed);
    const s1 = { round: 1, a: legacyNewState(), b: legacyNewState() }; // доски БЕЗ статусов
    const s2 = structuredClone(s1);
    for (let round = 0; round < 45; round++) {
      const hA = deal(rng), hB = deal(rng);
      const tA = { placements: botPlan(hA, s1.b, s1.a) };
      const tB = { placements: botPlan(hB, s1.a, s1.b) };
      const r1 = legacyResolve(s1, tA, tB);
      const r2 = E.resolveRound(s2, tA, tB);
      assert.deepEqual(r2.events, r1.events, 'events seed=' + seed);
      assert.deepEqual(r2.report, r1.report, 'report seed=' + seed);
      assert.equal(r2.finished, r1.finished);
      assert.equal(r2.winner, r1.winner);
      assert.deepEqual(s2, s1, 'state seed=' + seed);
      if (r1.finished) break;
    }
  }
});

test('скрытая информация: в отчёте раунда нет рук, только committed карты', () => {
  const f = attackFixture(STRONG.fire, F.fireDef);
  const r = E.resolveRound(f.state, f.tA, f.tB, { abilities: true, rng: mulberry32(1) });
  for (const entry of r.report.flatMap(row => [row.a, row.b])) {
    assert.equal(Object.keys(entry).filter(k => /hand/i.test(k)).length, 0);
    assert.ok(Array.isArray(entry.ownPairs));
    assert.ok(Array.isArray(entry.opponentPairs));
  }
  assert.ok(!JSON.stringify(r).includes('"hand"'));
});

test('у одного атакующего применяется ровно одна атакующая модификация защиты', () => {
  const f = attackFixture(STRONG.earth, F.airDef);
  const r = E.resolveRound(f.state, f.tA, f.tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(row1(r.report).a.info.d, Math.round(17 * 0.85));
});
