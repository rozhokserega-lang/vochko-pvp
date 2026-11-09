// Тесты этапа A: точный перенос правил v1.5. node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANKS, SUITS, deck, deal } from '../src/game/cards.js';
import { multiplier, combo, comboDetails } from '../src/game/combos.js';
import { type, attackInfo } from '../src/game/elements.js';
import * as E from '../src/game/engine.js';
import { validateTurn, materializeTurn } from '../src/game/validation.js';
import { mulberry32 } from '../src/game/rng.js';
import { legacyCombo, legacyType, legacyAttackInfo } from './legacy-reference.js';

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
test('Огонь против Воздуха ×1.0975 с округлением; поджог 4', () => {
  const atk = [C('♥','10'), C('♥','J')];       // 🔥 (10+10)*1.4=28
  const def = [C('♣','2'), C('♣','3')];        // 🌪️ (2+3)*1.4=7 → ×1.05=7.35→7
  const r = attackInfo(atk, def);
  assert.equal(r.at, '🔥'); assert.equal(r.dt, '🌪️');
  assert.equal(r.a, Math.round(28 * 1.0975)); // 31
  assert.equal(r.d, 7);
  assert.equal(r.hit, 24);
  assert.equal(r.burn, 4);
  assert.equal(r.match, '🔥 Огонь > Воздух');
  const l = legacyAttackInfo(atk, def);
  assert.deepEqual({ hit: r.hit, burn: r.burn, a: r.a, d: r.d }, { hit: l.hit, burn: l.burn, a: l.a, d: l.d });
});

test('Огонь против Земли ×0.9025, защита ×1.12, поджог ограничен 1', () => {
  const atk = [C('♥','10'), C('♥','J')];      // 🔥 (10+10)*1.4=28
  const def = [C('♠','2'), C('♠','3')];       // 🪨 (2+3)*1.4=7 → ×1.12=7.84→8
  const r = attackInfo(atk, def);
  const l = legacyAttackInfo(atk, def);
  assert.equal(r.a, Math.round(28 * 0.9025)); // 25
  assert.equal(r.d, 8);
  assert.equal(r.hit, 17);
  assert.equal(r.burn, 1);
  assert.deepEqual(r, l);
});

test('Вода против Земли: атака ×1.0975, защита ×1.12 затем ×0.85 (двойное округление)', () => {
  const atk = [C('♦','10'), C('♦','Q')];      // 💧 (10+10)*1.4=28
  const def = [C('♠','10'), C('♠','Q')];      // 🪨 (10+10)*1.4=28
  const r = attackInfo(atk, def);
  const l = legacyAttackInfo(atk, def);
  assert.equal(r.a, Math.round(28 * 1.0975)); // 31 — контрстихия Вода>Земля
  assert.equal(r.d, Math.round(Math.round(28 * 1.12) * 0.85)); // round(31*0.85)=26
  assert.equal(r.hit, 5);
  assert.deepEqual(r, l);
});

test('Пар против Бури и Воздуха: цепочка защиты и кап поджога', () => {
  const atk = [C('♥','10'), C('♦','J')];      // ♨️ пары разных мастей: (10+10)*1=20
  const stormDef = [C('♠','2'), C('♣','3')];  // 🌫️ (2+3)*1.4=7
  const airDef = [C('♣','2'), C('♣','3')];    // 🌪️ (2+3)*1.4=7
  const rs = attackInfo(atk, stormDef);
  assert.equal(type(atk), '♨️');
  assert.equal(rs.a, 20);                     // у Пара нет атакующих контрстихий
  assert.equal(rs.d, Math.round(Math.round(7 * 1.052) * 0.925)); // 7.364→7 ×0.925→6
  assert.equal(rs.hit, 14);
  assert.equal(rs.burn, 2);                   // против Бури кап не действует
  assert.deepEqual(rs, legacyAttackInfo(atk, stormDef));
  const ra = attackInfo(atk, airDef);
  assert.equal(ra.d, Math.round(Math.round(Math.round(7 * 1.05) * 0.925) * 1.08)); // 7.35→7→6.475→6×1.08→6
  assert.equal(ra.hit, 14);
  assert.equal(ra.burn, 1);                   // ♨️ vs 🌪️ → поджог 2, ограничен 1
  assert.deepEqual(ra, legacyAttackInfo(atk, airDef));
});

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

// ── resolveRound: поджог → прямой урон; укрепление; финалы ────────────────
function turn(atkL, defL, fort = null) {
  return { placements: [0, 1, 2].map((l) => ({ lane: l, attack: atkL[l], defense: defL[l] })), fortifyLane: fort };
}
const FIRE = [C('♥','10'), C('♥','J')], WATER = [C('♦','10'), C('♦','J')];
const EARTH = [C('♠','2'), C('♠','3')], STORM = [C('♣','2'), C('♣','3')];
const AIR = [C('♣','10'), C('♣','J')];

test('поджог прошлого раунда применяется первым и одновременно', () => {
  const state = { round: 1, a: E.newState(), b: E.newState() };
  state.a.burn = [4, 0, 0];
  state.b.burn = [2, 0, 0];
  const r = E.resolveRound(state, turn([FIRE, FIRE, FIRE], [EARTH, EARTH, EARTH]), turn([STORM, STORM, STORM], [EARTH, EARTH, EARTH]));
  const burnEvents = r.events.filter((e) => e.burn);
  assert.equal(burnEvents.length, 2);   // по одному на сторону (только линия 0)
  assert.equal(burnEvents[0].amount, 4); // внешняя башня A: 12 − 4 = 8
  assert.equal(burnEvents[0].side, 'a');
  assert.equal(burnEvents[1].amount, 2); // внешняя башня B: 12 − 2 = 10
  assert.equal(burnEvents[1].side, 'b');
  // Прямой урон после поджога: атака Бура против Земли — 0 урона (щит крепче)
  const direct = r.events.filter((e) => !e.burn && e.side === 'a');
  assert.equal(direct[0].amount, 0); // 7 атаки против 8 брони
  assert.equal(state.a.outer[0], 8); // башня A потрёпана только поджогом
});

test('симметричное укрепление: атака ×0.85, защита ×1.25, одновременное на одной линии', () => {
  const state = { round: 1, a: E.newState(), b: E.newState() };
  const r = E.resolveRound(state, turn([FIRE, FIRE, FIRE], [EARTH, EARTH, EARTH], 0), turn([STORM, STORM, STORM], [EARTH, EARTH, EARTH], 0));
  const row = r.report[0];
  assert.equal(row.a.fortified, true);
  assert.equal(row.b.fortified, true);
  const base = attackInfo(FIRE, EARTH);
  assert.equal(row.a.info.a, Math.round(base.a * 0.85));
  assert.equal(row.a.info.d, Math.round(base.d * 1.25));
});

test('укрепление при одиночном применении совпадает с легаси-порядком', () => {
  const state = { round: 1, a: E.newState(), b: E.newState() };
  const r = E.resolveRound(state, turn([FIRE, FIRE, FIRE], [EARTH, EARTH, EARTH], 1), turn([STORM, STORM, STORM], [EARTH, EARTH, EARTH]));
  const base = attackInfo(FIRE, EARTH);
  assert.equal(r.report[1].a.info.a, Math.round(base.a * 0.85));
  assert.equal(r.report[1].b.info.d, Math.round(base.d * 1.25));
});

test('обоюдная смерть — ничья; лимит 45 раундов — сравнение Нексусов', () => {
  const s1 = { round: 1, a: E.newState(), b: E.newState() };
  s1.a.nexus = 1; s1.b.nexus = 1;
  for (const p of [s1.a, s1.b]) { p.outer = [0, 0, 0]; p.inner = [0, 0, 0]; p.burn = [0, 0, 0]; }
  const lethal = turn([FIRE, FIRE, FIRE], [EARTH, EARTH, EARTH]); // hit 17 > 1 HP Нексуса
  const r1 = E.resolveRound(s1, lethal, lethal);
  assert.equal(r1.finished, true);
  assert.equal(r1.winner, 'draw');

  const s2 = { round: 45, a: E.newState(), b: E.newState() };
  s2.a.nexus = 30; s2.b.nexus = 10;
  const hand = [C('♥','2'), C('♦','2'), C('♠','2'), C('♣','2')];
  const noTurn = { placements: [0,1,2].map((l) => ({ lane: l, attack: ['♥2','♦2'], defense: ['♠2','♣2'] })), fortifyLane: null };
  const materialized = materializeTurn(hand, noTurn);
  const r2 = E.resolveRound(s2, materialized, materialized);
  assert.equal(r2.finished, true);
  assert.equal(r2.winner, 'a'); // 30 > 10 по HP Нексуса
});

// ── Property-тест: движок ≡ легаси на случайных парах ─────────────────────
test('движок совпадает с легаси-кодом на 2000 случайных парах', () => {
  const rng = mulberry32(2026);
  const d = deck();
  const pick = () => {
    const i = Math.floor(rng() * d.length);
    let j = Math.floor(rng() * d.length);
    while (j === i) j = Math.floor(rng() * d.length);
    return [d[i], d[j]];
  };
  for (let i = 0; i < 2000; i++) {
    const atk = pick(), def = pick();
    const mine = attackInfo(atk, def);
    const ref = legacyAttackInfo(atk, def);
    assert.deepEqual(mine, ref, `расхождение: ${atk.map(c=>c.id)} vs ${def.map(c=>c.id)}`);
    assert.equal(combo(atk), legacyCombo(atk));
  }
});

// ── Валидация хода ─────────────────────────────────────────────────────────
test('validateTurn: дубли, чужая масть, чужая карта, укрепление; materializeTurn', () => {
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
  assert.equal(wrongColor.ok, false); // чёрные в атаке

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
