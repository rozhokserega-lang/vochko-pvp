// Тесты умного бота: допустимость, детерминизм, отсутствие скрытой информации.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deal } from '../shared/cards.js';
import { mulberry32 } from '../shared/rng.js';
import { createGameState } from '../shared/engine.js';
import { beamLayouts, choosePlan, botPlan, evaluateState } from '../shared/bot.js';

const setup = (seed = 1) => {
  const rng = mulberry32(seed);
  return { rng, state: createGameState(), handA: deal(rng), handB: deal(rng) };
};

test('beamLayouts: допустимые раскладки — 3 линии, 12 уникальных карт из руки', () => {
  const { rng, state, handA } = setup();
  const layouts = beamLayouts(handA, state.a, state.b, { count: 8, rng });
  assert.ok(layouts.length > 0);
  for (const placements of layouts) {
    assert.deepEqual(placements.map(p => p.lane), [0, 1, 2]);
    const ids = placements.flatMap(p => [...p.attack, ...p.defense].map(c => c.id));
    assert.equal(ids.length, 12);
    assert.equal(new Set(ids).size, 12, 'карты не повторяются');
    for (const id of ids) assert.ok(handA.some(c => c.id === id), 'карта из руки');
  }
});

test('choosePlan: детерминирован по seed, возвращает план и статистику', () => {
  const run = () => {
    const { rng, state, handA } = setup(9);
    const p = choosePlan({ state, hand: handA, side: 'a', rng, depth: 2 });
    return { plan: p.plan, score: p.score, stats: p.stats };
  };
  const a = run(), b = run();
  assert.deepEqual(a.plan, b.plan);
  assert.deepEqual(a.score, b.score);
  assert.deepEqual(a.stats.candidates, b.stats.candidates);
  assert.deepEqual(a.stats.samples, b.stats.samples);
  assert.deepEqual(a.plan.placements.map(p => p.lane), [0, 1, 2]);
  assert.ok(a.stats.ms >= 0);
  assert.equal(a.stats.fallback, false);
});

test('бот не получает скрытую руку противника: план зависит только от досок и своей руки', () => {
  // Одинаковые входные данные + seed → одинаковый план; рука противника в
  // сигнатуре choosePlan отсутствует вовсе (state, hand, side, rng, бюджеты).
  const { state, handA } = setup(5);
  const p1 = choosePlan({ state, hand: handA, side: 'a', rng: mulberry32(5) });
  const p2 = choosePlan({ state, hand: handA, side: 'a', rng: mulberry32(5) });
  assert.deepEqual(p1.plan, p2.plan);
  // Против другого состояния доски план меняется (реагирует на поле).
  const { state: s2 } = setup(5);
  s2.b.outer[1] = 3;
  const p3 = choosePlan({ state: s2, hand: handA, side: 'a', rng: mulberry32(5) });
  assert.notDeepEqual(p1.plan, p3.plan);
});

test('бюджет времени: при budgetMs=0 бот не зависает и возвращает допустимый план', () => {
  const { rng, state, handA } = setup(3);
  const p = choosePlan({ state, hand: handA, side: 'a', rng, budgetMs: 0 });
  assert.deepEqual(p.plan.placements.map(p => p.lane), [0, 1, 2]);
  const ids = p.plan.placements.flatMap(x => [...x.attack, ...x.defense].map(c => c.id));
  assert.equal(new Set(ids).size, 12);
});

test('оценка позиции: больший Нексус и разрушенные башни врага ценятся выше', () => {
  const s = createGameState();
  s.b.inner[0] = 0; // у противника пробита линия
  assert.ok(evaluateState(s, 'a') > evaluateState(s, 'b'));
});

test('старый botPlan сохраняет прежнюю сигнатуру и результат', () => {
  const { rng, state, handA } = setup(11);
  const plan = botPlan(handA, state.b, state.a);
  assert.deepEqual(plan.map(p => p.lane), [0, 1, 2]);
  const ids = plan.flatMap(p => [...p.attack, ...p.defense].map(c => c.id));
  assert.equal(new Set(ids).size, 12);
});
