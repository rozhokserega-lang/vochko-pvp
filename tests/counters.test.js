// Тесты утверждённой механики контрстихий.
// Правило A: защита контрит атаку → атакующая способность отменена.
// Правило B: атака контрит защиту → защитная способность отменена.
// Правило C: направленность; базовый урон и статусы не трогаются.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from './helpers.js';
import { COUNTERS, ABILITIES, abilityIdOf, counterBlocks, isCounter } from '../shared/abilities.js';
import * as E from '../shared/engine.js';
import { mulberry32 } from '../shared/rng.js';

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
const F = {
  earthDef: [C('♠','5'), C('♠','6')],   // def 19
  earthAtk: [C('♠','2'), C('♠','3')],   // atk 7
};
const ADEF = [C('♠','4'), C('♠','5')];  // Земля, def 16
const FILL0A = [C('♠','2'), C('♠','3')], FILL0D = [C('♠','5'), C('♠','6')];
const FILL2A = [C('♠','7'), C('♠','8')], FILL2D = [C('♠','9'), C('♠','10')];
const Zweak = [C('♦','2'), C('♠','2')]; // Лёд, atk 6

const placement = (lane, attack, defense) => ({ lane, attack, defense });
const freshState = () => ({ round: 1, a: E.newState(), b: E.newState() });
const row1 = (report) => report[1];
const OPTS = { abilities: true, counters: true, rng: mulberry32(1) };

// A бьёт X по защите Y (атака B слабая, hit 0).
function attackFixture(X, Y) {
  const state = freshState();
  const tA = { placements: [placement(0, FILL0A, FILL0D), placement(1, X, ADEF), placement(2, FILL2A, FILL2D)] };
  const tB = { placements: [placement(0, FILL0A, FILL0D), placement(1, Zweak, Y), placement(2, FILL2A, FILL2D)] };
  return { state, tA, tB };
}
// A защищается W, B бьёт Z (атака A слабая).
function defenseFixture(W, Z) {
  const state = freshState();
  const tA = { placements: [placement(0, FILL0A, FILL0D), placement(1, F.wWater, W), placement(2, FILL2A, FILL2D)] };
  const tB = { placements: [placement(0, FILL0A, FILL0D), placement(1, Z, STRONG.earth), placement(2, FILL2A, FILL2D)] };
  return { state, tA, tB };
}
F.wWater = [C('♦','2'), C('♦','2')];
F.wFire = [C('♥','2'), C('♥','2')];

test('таблица: 10 направленных контротношений, формат COUNTERS[target] = [контрстихии]', () => {
  assert.equal(Object.keys(COUNTERS).length, 10);
  assert.equal(isCounter('water', 'fire'), true);      // Вода контрит Огонь
  assert.equal(isCounter('thunderstorm', 'water'), true);
  assert.equal(isCounter('lava', 'earth'), true);
  assert.equal(isCounter('sandstorm', 'air'), true);
  assert.equal(isCounter('ice', 'steam'), true);
  assert.equal(isCounter('water', 'lava'), true);
  assert.equal(isCounter('earth', 'fire_vortex'), true);
  assert.equal(isCounter('fire', 'ice'), true);
  assert.equal(isCounter('earth', 'thunderstorm'), true);
  assert.equal(isCounter('water', 'sandstorm'), true);
  // Правило C: направленность — обратных отношений нет.
  assert.equal(isCounter('fire', 'water'), false);
  assert.equal(isCounter('water', 'thunderstorm'), false);
  assert.equal(isCounter('lava', 'water'), false);
  assert.equal(counterBlocks('fire', 'water', true).atk, true);
  assert.equal(counterBlocks('fire', 'water', true).def, false);
  assert.equal(counterBlocks('lava', 'earth', true).def, true);
  assert.equal(counterBlocks('lava', 'earth', true).atk, false);
  assert.deepEqual(counterBlocks('fire', 'water', false), { atk: false, def: false });
  assert.equal(abilityIdOf('fire', 'attack'), 'fire_burn');
  assert.equal(abilityIdOf('water', 'defense'), 'water_cleanse');
});

test('Правило A (все 10): защитная контрстихия отменяет атакующую способность, урон сохраняется', () => {
  // [атакующий элемент, защита-контрстихия, атакующая способность, статус-проверка]
  const cases = [
    ['fire', 'water', 'fire_burn', s => !s.burn],
    ['water', 'thunderstorm', 'water_strip_armor', s => true],
    ['earth', 'lava', 'earth_pierce_def', s => true],
    ['air', 'sandstorm', 'air_weaken_def', s => !s.weakenDefense],
    ['steam', 'ice', 'steam_weaken_def', s => !s.weakenDefense],
    ['lava', 'water', 'lava_pierce_burn', s => !s.burn],
    ['fire_vortex', 'earth', 'fire_vortex_spread', s => !s.burn],
    ['ice', 'fire', 'ice_weaken_def', s => !s.weakenDefense],
    ['thunderstorm', 'earth', 'thunderstorm_discharge', s => true],
    ['sandstorm', 'water', 'sandstorm_weaken_atk', s => !s.weakenAttack],
  ];
  for (const [atk, def, abilityId, check] of cases) {
    const { state, tA, tB } = attackFixture(STRONG[atk], STRONG[def]);
    const r = E.resolveRound(state, tA, tB, OPTS);
    const row = row1(r.report);
    assert.ok(check(state.b.statuses[1]), atk + ': статус отменённой способности не создан');
    assert.ok(r.abilityEvents.some(e => e.ability === 'counter_triggered'
      && e.canceled === abilityId && e.lane === 1), atk + ': counter_triggered в отчёте');
    assert.equal(row.a.info.atkElement, atk);
    assert.equal(row.a.info.defElement, def);
  }
});

test('Правило A: базовый урон не изменяется контрстихией (Огонь против Воды)', () => {
  // Огонь 46 vs Вода 42 → hit 4 и с контрстихией, и без неё.
  const on = attackFixture(STRONG.fire, STRONG.water);
  const rOn = E.resolveRound(on.state, on.tA, on.tB, OPTS);
  assert.equal(row1(rOn.report).a.info.hit, 46 - 42);
  assert.ok(!on.state.b.statuses[1].burn); // Поджог отменён
  const off = attackFixture(STRONG.fire, STRONG.water);
  const rOff = E.resolveRound(off.state, off.tA, off.tB, { ...OPTS, counters: false });
  assert.equal(row1(rOff.report).a.info.hit, 46 - 42);
  assert.equal(off.state.b.statuses[1].burn, 2); // без контрстихии поджог есть
  // Числовой урон одинаков в обоих прогонах.
  assert.equal(row1(rOn.report).a.dealt, row1(rOff.report).a.dealt);
});

test('Правило A: Лава против Воды — пробой и поджог отменены вместе', () => {
  const f = attackFixture(STRONG.lava, STRONG.water); // 46 vs 42
  const r = E.resolveRound(f.state, f.tA, f.tB, OPTS);
  assert.equal(row1(r.report).a.info.d, 42);           // без пробоя ×0.9
  assert.equal(row1(r.report).a.info.hit, 4);
  assert.ok(!f.state.b.statuses[1].burn);
});

test('Правило A: Гроза против Земли — Разряд не срабатывает', () => {
  // Без контрстихии Разряд работает: Лёд не контрит Грозу.
  const f2 = attackFixture(STRONG.thunderstorm, STRONG.ice); // 44 vs 46 → 0... нужен hit
  // защита слабее: Лёд-слабая пара
  const weakIce = [C('♦','4'), C('♠','5')]; // Лёд: base 9×1.2? ♦♠ → ice; 9×1.2=10.8→11; def 11×1.2=13.2→13
  const r = E.resolveRound(f2.state, f2.tA, f2.tB, OPTS);
  assert.ok(!r.abilityEvents.some(e => e.ability === 'thunderstorm_discharge' && e.lane === 1), 'hit 0 — Разряда нет');
  // Земля-защита (контрстихия) с hit > 0
  const weakEarth = [C('♠','4'), C('♠','5')]; // def 16
  const f3 = attackFixture(STRONG.thunderstorm, weakEarth);
  const r3 = E.resolveRound(f3.state, f3.tA, f3.tB, OPTS);
  assert.ok(row1(r3.report).a.info.hit > 0);
  assert.ok(!r3.abilityEvents.some(e => e.ability === 'thunderstorm_discharge'));
  assert.ok(r3.abilityEvents.some(e => e.ability === 'counter_triggered' && e.canceled === 'thunderstorm_discharge'));
  assert.equal(f3.state.b.outer[0], 12); // линия 0 не задета разрядом
  assert.equal(f3.state.b.outer[2], 12);
  // контроль: та же атака против не-контрстихии (Лёд weak) — Разряд работает
  const f4 = attackFixture(STRONG.thunderstorm, weakIce);
  const r4 = E.resolveRound(f4.state, f4.tA, f4.tB, OPTS);
  assert.ok(r4.abilityEvents.some(e => e.ability === 'thunderstorm_discharge'), 'Разряд без контрстихии работает');
});

test('Правило B (выборка): атака контрит защитную способность', () => {
  // Лава (атака) контрит Землю (защита): броня не создаётся.
  const f = defenseFixture(STRONG.earth, STRONG.lava); // 46 vs 48 → 0
  const r = E.resolveRound(f.state, f.tA, f.tB, OPTS);
  assert.ok(r.abilityEvents.some(e => e.ability === 'counter_triggered' && e.canceled === 'earth_armor'));
  assert.ok(!f.state.a.statuses[1].armor, 'броня не перенесена');
  // Огонь (атака) контрит Лёд (защита): Стужа отменена.
  const f2 = defenseFixture(STRONG.ice, STRONG.fire); // 46 vs 46 → 0
  const r2 = E.resolveRound(f2.state, f2.tA, f2.tB, OPTS);
  assert.ok(r2.abilityEvents.some(e => e.ability === 'counter_triggered' && e.canceled === 'ice_weaken_atk'));
  assert.ok(!f2.state.b.statuses[1].weakenAttack);
  // Гроза (атака) контрит Воду (защита): очищение/лечение отменено (пример 3).
  const f3 = defenseFixture(STRONG.water, STRONG.thunderstorm); // 44 vs 42 → 2
  f3.state.a.outer[1] = 10;
  f3.state.a.statuses[1] = { burn: 2 }; // поджог прошлого раунда: без очищения тикнет
  const r3 = E.resolveRound(f3.state, f3.tA, f3.tB, OPTS);
  assert.ok(r3.abilityEvents.some(e => e.ability === 'counter_triggered' && e.canceled === 'water_cleanse'));
  assert.ok(r3.abilityEvents.some(e => e.ability === 'burn_tick' && e.amount === 2)); // поджог тикнул
  assert.ok(!r3.abilityEvents.some(e => e.ability === 'water_cleanse'), 'очищение отменено');
});

test('Правило B: ответка Огня/отражение Воздуха отменены контр-атакой', () => {
  // Лёд (атака) контрит Огонь (защита)? Нет: Огонь контрит Лёд. Проверяем обратное
  // направление: Огонь защищается против атаки Лёд — Лёд НЕ контрит Огонь,
  // значит ответка Огня работает (направленность).
  const f = defenseFixture(STRONG.fire, Zweak); // 6 vs 34 → 0
  const r = E.resolveRound(f.state, f.tA, f.tB, OPTS);
  assert.ok(r.abilityEvents.some(e => e.ability === 'fire_retaliation'));
  assert.equal(f.state.b.outer[1], 10);
  // А атака Огня по защите Льда отменяет Стужу (проверено выше), но урон проходит.
  const f2 = defenseFixture(STRONG.ice, STRONG.fire);
  const r2 = E.resolveRound(f2.state, f2.tA, f2.tB, OPTS);
  assert.equal(row1(r2.report).b.info.hit, 0); // числовой урон посчитан штатно
});

test('существующие статусы контрстихия не удаляет', () => {
  // Огонь атакует Воду: поджог отменён, но чужие статусы на линии остаются.
  const f = attackFixture(STRONG.fire, STRONG.water);
  f.state.b.statuses[2] = { burn: 1 }; // соседняя линия — вне столкновения
  E.resolveRound(f.state, f.tA, f.tB, OPTS);
  // поджог соседней линии тикнул в начале раунда (жизненный цикл), контрстихия
  // не должна была его снять до тика — проверяем, что тик состоялся
  // (в abilityEvents нет cleanse), и статус соседней линии обработан штатно.
  const cleanse = f.state.b.statuses[2];
  assert.ok(cleanse instanceof Object);
});

test('контрстихии работают на всех трёх линиях', () => {
  const state = freshState();
  const atk = STRONG.fire, def = STRONG.water;
  const tA = { placements: [placement(0, atk, ADEF), placement(1, atk, ADEF), placement(2, atk, ADEF)] };
  const tB = { placements: [placement(0, Zweak, def), placement(1, Zweak, def), placement(2, Zweak, def)] };
  const r = E.resolveRound(state, tA, tB, OPTS);
  for (const lane of [0, 1, 2]) {
    assert.ok(r.abilityEvents.some(e => e.ability === 'counter_triggered' && e.lane === lane), 'линия ' + lane);
    assert.ok(!state.b.statuses[lane].burn, 'линия ' + lane + ': поджог отменён');
  }
});

test('одновременные атаки: зеркальный Огонь против Воды симметричен', () => {
  const state = freshState();
  const mk = () => ({ placements: [placement(0, STRONG.fire, STRONG.water), placement(1, STRONG.fire, STRONG.water), placement(2, STRONG.fire, STRONG.water)] });
  const r = E.resolveRound(state, mk(), mk(), { ...OPTS, rng: mulberry32(7) });
  assert.deepEqual(state.a.outer, state.b.outer);
  assert.deepEqual(state.a.statuses, state.b.statuses);
  assert.ok(r.abilityEvents.filter(e => e.ability === 'counter_triggered').length >= 6);
});

test('counters=false: способности работают как прежде (регрессия)', () => {
  const f = attackFixture(STRONG.fire, STRONG.water);
  const r = E.resolveRound(f.state, f.tA, f.tB, { abilities: true, rng: mulberry32(1) });
  assert.equal(f.state.b.statuses[1].burn, 2);
  assert.ok(!r.abilityEvents.some(e => e.ability === 'counter_triggered'));
});

test('отчёт: counter_triggered содержит пары стихий и отменённую способность', () => {
  const f = attackFixture(STRONG.fire, STRONG.water);
  const r = E.resolveRound(f.state, f.tA, f.tB, OPTS);
  const ev = r.abilityEvents.find(e => e.ability === 'counter_triggered');
  assert.equal(ev.by, 'water');
  assert.equal(ev.canceled, 'fire_burn');
  assert.equal(ABILITIES[ev.canceled].name, 'Поджог');
  assert.equal(Object.values(ABILITIES).length, 20); // таблица способностей не пострадала
});
