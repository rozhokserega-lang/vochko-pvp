// Регрессии неизменённых карточных правил и здоровья. Новый баланс — elements.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANKS, SUITS, deck, deal } from '../shared/cards.js';
import { multiplier, combo, comboDetails } from '../shared/combos.js';
import { type, attackInfo } from '../shared/elements.js';
import * as E from '../shared/engine.js';
import { validateTurn, materializeTurn } from '../shared/validation.js';
import { mulberry32 } from '../shared/rng.js';
import { legacyType } from './legacy-reference.js';

const C = (s, r) => ({ id: s + r, s, r, v: r === 'A' ? 11 : r === 'J' || r === 'Q' || r === 'K' ? 10 : +r });

// ── Колода и рука ──────────────────────────────────────────────────────────
test('колода 52 карты, ранги 2..A', () => {
  const d = deck();
  assert.equal(d.length, 52);
  assert.deepEqual([...RANKS].sort(), ['10','2','3','4','5','6','7','8','9','A','J','K','Q']);
  assert.equal(new Set(d.map((c) => c.id)).size, 52);
  assert.equal(SUITS.join(''), '♥♦♠♣');
});

test('рука: 7 красных + 7 чёрных, без дублей, детерминизм по seed', () => {
  for (const seed of [1, 42, 777]) {
    const h = deal(mulberry32(seed));
    assert.equal(h.length, 14);
    assert.equal(new Set(h.map((c) => c.id)).size, 14);
    assert.equal(h.filter((c) => c.s === '♥' || c.s === '♦').length, 7);
    assert.equal(h.filter((c) => c.s === '♠' || c.s === '♣').length, 7);
    const h2 = deal(mulberry32(seed));
    assert.deepEqual(h, h2, 'одинаковый seed — одинаковая рука');
  }
});

// ── Комбинации: строгий приоритет, Math.round ──────────────────────────────
test('приоритеты комбинаций и точные числа', () => {
  assert.equal(combo([C('♥','A'), C('♦','A')]), 55);          // (11+11)*2.5
  assert.equal(multiplier(C('♥','A'), C('♦','A')).m, 2.5);
  assert.equal(combo([C('♥','K'), C('♥','Q')]), 40);          // (10+10)*2 одной масти
  assert.equal(combo([C('♠','A'), C('♠','K')]), 38);          // (11+10)*1.8=37.8 → 38 (не 1.4!)
  assert.equal(combo([C('♣','7'), C('♠','7')]), 22);          // 14*1.6=22.4 → 22
  assert.equal(combo([C('♥','5'), C('♥','6')]), 15);          // одна масть бьёт соседей: 11*1.4=15.4 → 15
  assert.equal(combo([C('♥','5'), C('♦','6')]), 13);          // соседние значения: 11*1.2=13.2 → 13
  assert.equal(combo([C('♠','2'), C('♣','7')]), 9);           // обычная: 9*1
  assert.equal(multiplier(C('♠','K'), C('♣','K')).name, 'Одинаковый номинал');
});

// ── Стихии: тип пары ───────────────────────────────────────────────────────
test('типы пар: стихии, Пар, Буря', () => {
  assert.equal(type([C('♥','2'), C('♥','9')]), '🔥');
  assert.equal(type([C('♦','2'), C('♦','9')]), '💧');
  assert.equal(type([C('♠','2'), C('♠','9')]), '🪨');
  assert.equal(type([C('♣','2'), C('♣','9')]), '🌪️');
  assert.equal(type([C('♥','2'), C('♦','9')]), '♨️');
  assert.equal(type([C('♠','2'), C('♣','9')]), '🌫️');
  assert.equal(legacyType([C('♥','2'), C('♦','9')]), type([C('♥','2'), C('♦','9')]));
});

// ── attackInfo: контрстихии, округления, поджог ────────────────────────────




test('ноль урона — нет поджога', () => {
  const atk = [C('♥','2'), C('♥','3')];       // 🔥 5*1.4=7
  const def = [C('♠','K'), C('♠','Q')];       // 🪨 20*1.4=28 → ×1.12=31.36→31
  const r = attackInfo(atk, def);
  assert.equal(r.hit, 0);
  assert.equal(r.burn, 0);
});

// ── Башни и Нексус ─────────────────────────────────────────────────────────
test('урон: внешний 12 → внутренний 18 → Нексус, излишек НЕ переносится', () => {
  const p = E.newState();
  E.damage(p, 0, 15); // 15 > 12 — внешний падает, остаток сгорает
  assert.equal(p.outer[0], 0);
  assert.equal(p.inner[0], 18);
  E.damage(p, 0, 20); // внутренний 18 → падает, остаток сгорает
  assert.equal(p.inner[0], 0);
  assert.equal(p.nexus, 80);
  assert.equal(E.isOpen(p, 0), true);
});

test('Нексус: щит 0/40/70/100 по пробитым линиям, округление', () => {
  const p = E.newState();
  assert.equal(E.shieldPct(p), 0);
  E.damage(p, 0, 12); E.damage(p, 0, 18); // пробита только линия 0
  assert.equal(E.shieldPct(p), 40);
  E.damage(p, 0, 25); // Нексус: 25 * 40% = 10
  assert.equal(p.nexus, 70);
  E.damage(p, 1, 12); E.damage(p, 1, 18); // линия 1
  assert.equal(E.shieldPct(p), 70);
  E.damage(p, 1, 31); // 31 * 70% = 21.7 → 22
  assert.equal(p.nexus, 48);
});

const FIRE = [C('♥','10'), C('♥','J')], WATER = [C('♦','10'), C('♦','J')];
const EARTH = [C('♠','2'), C('♠','3')], STORM = [C('♣','2'), C('♣','3')];
const AIR = [C('♣','10'), C('♣','J')];

// ── Валидация хода ─────────────────────────────────────────────────────────
test('validateTurn: дубли, чужие карты, укрепление; materializeTurn', () => {
  const ids = (pair) => pair.map((c) => c.id);
  const hand = [...FIRE, ...WATER, ...EARTH, ...STORM, ...AIR, [C('♥','2'), C('♦','5')], [C('♠','9'), C('♣','9')]].flat();
  const good = {
    placements: [
      { lane: 0, attack: ids(FIRE), defense: ids(EARTH) },
      { lane: 1, attack: ids(WATER), defense: ids(STORM) },
      { lane: 2, attack: ['♥2','♦5'], defense: ['♠9','♣9'] },
    ],
    fortifyLane: null,
  };
  assert.equal(validateTurn(hand, good).ok, true);

  // materializeTurn: id → карты движка
  const materialized = materializeTurn(hand, good);
  assert.equal(materialized.placements[2].attack[0].v, 2);
  assert.equal(materialized.placements[0].defense[1].s, '♠');

  const turnIds = (atk, def, fort = null) => ({
    placements: [0, 1, 2].map((l) => ({ lane: l, attack: atk[l], defense: def[l] })),
    fortifyLane: fort,
  });
  const dup = validateTurn(hand, turnIds([ids(FIRE), ids(FIRE), ids(WATER)], [ids(EARTH), ids(STORM), ids(AIR)]));
  assert.equal(dup.ok, false); // карта дважды

  const wrongColor = validateTurn(hand, turnIds([ids(FIRE), ids(WATER), ['♠2','♣3']], [ids(EARTH), ids(STORM), ids(AIR)]));
  assert.equal(wrongColor.ok, false); // карта повторена между парами (цвет теперь разрешён)

  const alien = validateTurn(hand, turnIds([['♥K','♦Q'], ids(WATER), ids(AIR)], [ids(EARTH), ids(STORM), ids(EARTH)]));
  assert.equal(alien.ok, false); // нет в руке

  const fort = validateTurn(hand, { ...good, fortifyLane: 5 });
  assert.equal(fort.ok, false);
});

// ── comboDetails (предпросмотр) ────────────────────────────────────────────
test('comboDetails для предпросмотра', () => {
  const d = comboDetails([C('♥','A'), C('♦','A')]);
  assert.deepEqual(d, { base: 22, m: 2.5, name: 'Два туза', power: 55 });
  assert.equal(comboDetails([C('♥','2')]), null);
});
