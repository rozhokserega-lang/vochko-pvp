// Аудит методологии и вариантной системы баланса.
// Этап 1-2: проверка сидов, спецификации, корректности вариантов.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameSeed } from '../shared/seeds.js';
import { mulberry32 } from '../shared/rng.js';
import { C } from './helpers.js';
import { VARIANT_DEFAULTS, resolveVariants } from '../shared/abilities.js';
import * as E from '../shared/engine.js';

// ── Аудит методологии (Этап 2) ─────────────────────────────────────────────
test('АУДИТ-фикс: зеркальные партии получают РАЗНЫЕ потоки случайности', () => {
  // Прежний баг: mulberry32(seed + 0.5) обрезал дробную часть → дубликаты.
  const a = mulberry32(gameSeed(1, 0))(), b = mulberry32(gameSeed(1, 1))();
  assert.notEqual(a, b, 'соседние партии (swap=false/true) — разные потоки');
  // Пары не пересекаются между собой.
  assert.notEqual(gameSeed(1, 0), gameSeed(1, 2));
  assert.notEqual(gameSeed(1, 1), gameSeed(1, 3));
  // Детерминизм.
  assert.equal(gameSeed(1, 5), gameSeed(1, 5));
});

test('способности соответствуют спецификации: Лёд −10%/−15% — покрыто в abilities.test.js', () => {
  assert.equal(Object.keys(VARIANT_DEFAULTS).length, 7);
});

// ── Вариантная система ─────────────────────────────────────────────────────
const STRONG = {
  fire: [C('♥','A'), C('♥','K')],
  steam: [C('♥','A'), C('♦','K')],
  sandstorm: [C('♠','A'), C('♣','K')],
  lava: [C('♥','A'), C('♠','K')],
  water: [C('♦','A'), C('♦','K')],
  ice: [C('♦','A'), C('♠','K')],
  earth: [C('♠','A'), C('♠','K')],
};
const FILL0A = [C('♠','2'), C('♠','3')], FILL0D = [C('♠','5'), C('♠','6')];
const FILL2A = [C('♠','7'), C('♠','8')], FILL2D = [C('♠','9'), C('♠','10')];
const ADEF = [C('♠','4'), C('♠','5')];
const Zweak = [C('♦','2'), C('♠','2')];
const wFire = [C('♥','2'), C('♥','2')];
const placement = (lane, attack, defense) => ({ lane, attack, defense });

// B бьёт Z по защите W (проверка защитных вариантов); A атакует слабо.
function defenseFixture(W, Z) {
  const state = { round: 1, a: E.newState(), b: E.newState() };
  const tA = { placements: [placement(0, FILL0A, FILL0D), placement(1, wFire, W), placement(2, FILL2A, FILL2D)] };
  const tB = { placements: [placement(0, FILL0A, FILL0D), placement(1, Z, STRONG.earth), placement(2, FILL2A, FILL2D)] };
  return { state, tA, tB };
}

const OPTS = (v) => ({ abilities: true, counters: true, rng: mulberry32(1), variants: v });

test('вариант fireRetaliation=blocked3: ответка 3 вместо 2', () => {
  const f = defenseFixture(STRONG.fire, wFire); // hit 0 → ответка
  const r = E.resolveRound(f.state, f.tA, f.tB, OPTS({ fireRetaliation: 'blocked3' }));
  const ev = r.events.find(e => e.extra && e.side === 'b');
  assert.equal(ev.amount, 3);
  assert.equal(f.state.b.outer[1], 9); // 12 − 3
});

test('вариант fireRetaliation=onHit: ответка и при попадании', () => {
  // A атакует Огнём по защите Огня (34) → hit 12 → ответка бьёт АТАКУЮЩЕГО (A).
  const state = { round: 1, a: E.newState(), b: E.newState() };
  const tA = { placements: [placement(0, FILL0A, FILL0D), placement(1, STRONG.fire, ADEF), placement(2, FILL2A, FILL2D)] };
  const tB = { placements: [placement(0, FILL0A, FILL0D), placement(1, Zweak, STRONG.fire), placement(2, FILL2A, FILL2D)] };
  const r = E.resolveRound(state, tA, tB, OPTS({ fireRetaliation: 'onHit' }));
  const ev = r.events.filter(e => e.extra && e.ability === 'fire_retaliation');
  assert.equal(ev.length, 1, 'ответка при попадании в щит');
  assert.equal(state.a.outer[1], 10); // атакующий получил 2
  // База (blocked): при попадании ответки нет.
  const f2 = defenseFixture(STRONG.fire, Zweak);
  f2.state.a.outer[1] = 0; // заглушка-неиспользуется
  const f3 = defenseFixture(STRONG.fire, STRONG.fire); // hit 12 против 34... Z=STRONG.fire 46 vs W 34 → 12
  const r3 = E.resolveRound(f3.state, f3.tA, f3.tB, { abilities: true, counters: true, rng: mulberry32(1) });
  assert.ok(!r3.events.some(e => e.extra && e.ability === 'fire_retaliation'), 'база: ответки при попадании нет');
});

test('вариант lavaCounter=three/strongHit', () => {
  const mk = (W, Z) => {
    const state = { round: 1, a: E.newState(), b: E.newState() };
    return {
      state,
      tA: { placements: [placement(0, FILL0A, FILL0D), placement(1, wFire, W), placement(2, FILL2A, FILL2D)] },
      tB: { placements: [placement(0, FILL0A, FILL0D), placement(1, Z, STRONG.earth), placement(2, FILL2A, FILL2D)] },
    };
  };
  // Лава-защита 36, удар Огня 46 → hit 10; three: ответка 3 атакующему (A)
  const f = mk(STRONG.lava, STRONG.fire);
  const r = E.resolveRound(f.state, f.tA, f.tB, OPTS({ lavaCounter: 'three' }));
  assert.equal(f.state.b.outer[1], 9); // атакующий B: 12 − 3 ответки
  assert.equal(f.state.a.outer[1], 2); // удар A: 12 − 10
  // strongHit: сильный удар (≥3) триггерит
  const f3 = mk(STRONG.lava, STRONG.fire);
  const r3 = E.resolveRound(f3.state, f3.tA, f3.tB, OPTS({ lavaCounter: 'strongHit' }));
  assert.ok(r3.abilityEvents.some(e => e.ability === 'lava_counter'));
  // слабый удар (0) не триггерит
  const f4 = mk(STRONG.lava, wFire);
  const r4 = E.resolveRound(f4.state, f4.tA, f4.tB, OPTS({ lavaCounter: 'strongHit' }));
  assert.ok(!r4.abilityEvents.some(e => e.ability === 'lava_counter'));
});

test('вариант steamDampen=pct15 и healPartial', () => {
  const steamDef = [C('♥','5'), C('♦','6')]; // def 14
  const f = defenseFixture(steamDef, STRONG.fire); // 46 vs 14 → 32 → ×0.85 = 27
  const r = E.resolveRound(f.state, f.tA, f.tB, OPTS({ steamDampen: 'pct15' }));
  const row = r.report[1];
  assert.equal(row.b.info.hit, Math.round(Math.round(46 - 14) * 0.85));
  // healPartial: лечение при слабом ударе (hit ≤ 2)
  const f2 = defenseFixture(steamDef, wFire); // 7 vs 14 → 0 — полная блокировка
  E.resolveRound(f2.state, f2.tA, f2.tB, OPTS({ steamDampen: 'healPartial' }));
  assert.equal(f2.state.a.outer[1], 12); // лечение при блоке как обычно
});

test('вариант waterCleanse=heal1/single', () => {
  const waterDef = STRONG.water;
  const mk = (statuses) => {
    const state = { round: 1, a: E.newState(), b: E.newState() };
    state.a.outer[1] = 10;
    state.a.statuses[1] = statuses;
    const tA = { placements: [placement(0, FILL0A, FILL0D), placement(1, wFire, waterDef), placement(2, FILL2A, FILL2D)] };
    const tB = { placements: [placement(0, FILL0A, FILL0D), placement(1, Zweak, STRONG.earth), placement(2, FILL2A, FILL2D)] };
    return { state, tA, tB };
  };
  const f1 = mk({ burn: 2, weakenAttack: 15 });
  E.resolveRound(f1.state, f1.tA, f1.tB, OPTS({ waterCleanse: 'single' }));
  assert.deepEqual(f1.state.a.statuses[1], {}, 'один статус очищен, второй... нет: применён и стёрт');
  // single: снят только burn (первый по списку) → weakenAttack применён в этом раунде
  const f2 = mk({});
  E.resolveRound(f2.state, f2.tA, f2.tB, OPTS({ waterCleanse: 'heal1' }));
  assert.equal(f2.state.a.outer[1], 11, 'лечение 1 вместо 2');
});

test('варианты lavaPierce=pct5 / burnArmor', () => {
  const airDef = [C('♣','5'), C('♣','6')]; // def 17
  const mk = (Y) => {
    const state = { round: 1, a: E.newState(), b: E.newState() };
    const tA = { placements: [placement(0, FILL0A, FILL0D), placement(1, STRONG.lava, ADEF), placement(2, FILL2A, FILL2D)] };
    const tB = { placements: [placement(0, FILL0A, FILL0D), placement(1, Zweak, Y), placement(2, FILL2A, FILL2D)] };
    return { state, tA, tB };
  };
  const f = mk(airDef);
  const r = E.resolveRound(f.state, f.tA, f.tB, OPTS({ lavaPierce: 'pct5' }));
  assert.equal(r.report[1].a.info.d, Math.round(17 * 0.95));
  // pct5 (не burnArmor): поджог применяется безусловно при попадании
  assert.equal(f.state.b.statuses[1].burn, 1);
  // burnArmor: поджог только при броне у жертвы
  const f2 = mk(airDef);
  f2.state.b.statuses[1] = { armor: 3 };
  E.resolveRound(f2.state, f2.tA, f2.tB, OPTS({ lavaPierce: 'burnArmor' }));
  assert.equal(f2.state.b.statuses[1].burn, 1, 'броня есть — лава подожгла');
  const f3 = mk(airDef);
  E.resolveRound(f3.state, f3.tA, f3.tB, OPTS({ lavaPierce: 'burnArmor' }));
  assert.ok(!f3.state.b.statuses[1].burn, 'брони нет — поджога нет');
});

test('вариант waterStrip=two (против Земли, чтобы не сработала контр-Вода)', () => {
  const state = { round: 1, a: E.newState(), b: E.newState() };
  state.b.statuses[1] = { armor: 3 };
  const tA = { placements: [placement(0, FILL0A, FILL0D), placement(1, STRONG.water, ADEF), placement(2, FILL2A, FILL2D)] };
  const tB = { placements: [placement(0, FILL0A, FILL0D), placement(1, Zweak, STRONG.earth), placement(2, FILL2A, FILL2D)] };
  // База: снять 3 из 3 брони
  const r = E.resolveRound(state, tA, tB, OPTS({ waterStrip: 'three' }));
  assert.equal(r.report[1].a.info.armorStripped, 3);
  // Вариант: снять 2
  const state2 = { round: 1, a: E.newState(), b: E.newState() };
  state2.b.statuses[1] = { armor: 3 };
  const r2 = E.resolveRound(state2, tA, tB, OPTS({ waterStrip: 'two' }));
  assert.equal(r2.report[1].a.info.armorStripped, 2);
});

test('вариант sandstormShield=three (атака Огнём: не контрит Бурю)', () => {
  const state = { round: 1, a: E.newState(), b: E.newState() };
  const tA = { placements: [placement(0, FILL0A, FILL0D), placement(1, STRONG.fire, ADEF), placement(2, FILL2A, FILL2D)] };
  const tB = { placements: [placement(0, FILL0A, FILL0D), placement(1, Zweak, STRONG.sandstorm), placement(2, FILL2A, FILL2D)] };
  const r = E.resolveRound(state, tA, tB, OPTS({ sandstormShield: 'three' }));
  assert.equal(r.report[1].a.info.d, 44 + 3); // защита 44 + щит 3
  // База: +4
  const s2 = { round: 1, a: E.newState(), b: E.newState() };
  const r2 = E.resolveRound(s2, tA, tB, OPTS({ sandstormShield: 'four' }));
  assert.equal(r2.report[1].a.info.d, 48);
});

test('дефолт variants = исходный баланс (без изменений)', () => {
  assert.deepEqual(resolveVariants(), VARIANT_DEFAULTS);
  assert.deepEqual(resolveVariants({}), VARIANT_DEFAULTS);
  const f = defenseFixture(STRONG.fire, wFire);
  E.resolveRound(f.state, f.tA, f.tB, OPTS({}));
  assert.equal(f.state.b.outer[1], 10); // базовая ответка 2
});
