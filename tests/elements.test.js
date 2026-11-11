import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deck, deal } from '../shared/cards.js';
import { combo } from '../shared/combos.js';
import { legacyCombo } from './legacy-reference.js';
import { ELEMENTS, elementOf, pairStats, lineStats, attackInfo } from '../shared/elements.js';
import { validateTurn, materializeTurn, fortifyAllowed } from '../shared/validation.js';
import { newState, resolveRound, MAX_ROUNDS } from '../shared/engine.js';
import { botPlan } from '../shared/bot.js';
import { mulberry32 } from '../shared/rng.js';
import { revealAssignments } from '../src/ui/combat-logic.js';
import { elementAnimHTML } from '../src/ui/arena/ElementEffect.js';
import { placementHTML } from '../src/ui/Placement.js';
import { roundReportHTML } from '../src/ui/PairPreview.js';

const card = (s, r) => deck().find(c => c.s === s && c.r === r);
const plan = hand => ({ placements: [0, 1, 2].map(lane => ({ lane,
  attack: hand.slice(lane * 4, lane * 4 + 2).map(c => c.id),
  defense: hand.slice(lane * 4 + 2, lane * 4 + 4).map(c => c.id),
})), fortifyLane: null });
const state = () => ({ round: 1, a: newState(), b: newState() });
const repeated = (p, q) => ({ placements: [0, 1, 2].map(lane => ({ lane, attack: p, defense: q })) });
const fire = [card('♥', '10'), card('♥', 'J')];
const low = [card('♥', '2'), card('♠', '3')];
const lethal = repeated(fire, fire);

const table = [
  ['fire', '♥♥', 20, -10], ['water', '♦♦', 10, 10], ['earth', '♠♠', -5, 25],
  ['air', '♣♣', 5, 15], ['steam', '♥♦', 10, 10], ['lava', '♥♠', 20, -5],
  ['fire_vortex', '♥♣', 15, 0], ['ice', '♦♠', 0, 20],
  ['thunderstorm', '♦♣', 15, 5], ['sandstorm', '♠♣', 5, 15],
];
for (const [id, suits, atk, def] of table) test(`${id}: масти, порядок, точные бонусы и временный эффект`, () => {
  const pair = [card(suits[0], '5'), card(suits[1], '9')];
  assert.equal(elementOf(pair).id, id);
  assert.equal(elementOf([...pair].reverse()).id, id);
  assert.equal(ELEMENTS[id].attackBonus, atk);
  assert.equal(ELEMENTS[id].defenseBonus, def);
  assert.equal(pairStats(pair).attack, Math.round(combo(pair) * (1 + atk / 100)));
  assert.equal(pairStats(pair).defense, Math.round(combo(pair) * (1 + def / 100)));
  assert.match(elementAnimHTML(ELEMENTS[id].icon), /element-anim/);
});

test('все 1326 пар: старые карточные множители, округление и новый баланс', () => {
  assert.equal(Object.keys(ELEMENTS).length, 10);
  const cards = deck();
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const pair = [cards[i], cards[j]], p = pairStats(pair), e = ELEMENTS[p.element];
    assert.equal(combo(pair), legacyCombo(pair));
    assert.equal(p.basePower, legacyCombo(pair));
    assert.equal(p.attack, Math.round(p.basePower * (1 + e.attackBonus / 100)));
    assert.equal(p.defense, Math.round(p.basePower * (1 + e.defenseBonus / 100)));
    assert.deepEqual(pairStats([...pair].reverse()), p);
  }
  // 15 × 1.10 = 16.5 → 17; округляется каждая пара до сложения.
  const water = [card('♦', '5'), card('♦', '6')];
  assert.equal(pairStats(water).attack, 17);
  assert.equal(lineStats({ attack: water, defense: water }).attack, 34);
});

test('любые масти, 6 пар/12 карт, две оставшиеся исключены, порядок линий нормализуется', () => {
  const hand = deal(mulberry32(5));
  // Перемешиваем красные/чёрные, чтобы оба вида слотов содержали смешанные пары.
  const mixed = hand.slice(0, 7).flatMap((c, i) => [c, hand[i + 7]]);
  const raw = plan(mixed);
  assert.equal(validateTurn(hand, raw).ok, true);
  raw.placements.reverse();
  const materialized = materializeTurn(hand, raw);
  assert.deepEqual(materialized.placements.map(p => p.lane), [0, 1, 2]);
  const r = resolveRound(state(), materialized, materialized);
  const used = r.report.flatMap(row => row.a.ownPairs.flat().map(c => c.id));
  assert.equal(new Set(used).size, 12);
  for (const c of mixed.slice(12)) assert.equal(used.includes(c.id), false);
  for (const row of r.report) {
    const p = materialized.placements[row.lane];
    assert.equal(row.a.info.a, pairStats(p.attack).attack + pairStats(p.defense).attack);
    assert.equal(row.a.info.d, pairStats(p.attack).defense + pairStats(p.defense).defense);
  }
});

test('валидатор отклоняет дубли, чужие карты, неправильные пары/линии, действия и подделки', () => {
  const hand = deal(mulberry32(6)), good = plan(hand);
  const reject = change => { const t = structuredClone(good); change(t); assert.equal(validateTurn(hand, t).ok, false); };
  reject(t => t.placements[1].attack[0] = t.placements[0].attack[0]);
  reject(t => t.placements[0].attack[0] = 'alien');
  reject(t => t.placements[0].attack.pop());
  reject(t => t.placements[0].defense.push(hand[13].id));
  reject(t => t.placements.pop());
  reject(t => t.placements.push(t.placements[0]));
  reject(t => t.placements[1].lane = 0);
  reject(t => t.placements[1].lane = '1');
  reject(t => t.placements[0] = null);
  reject(t => t.placements[0].attack[0] = { ...hand[0], v: 999 });
  for (const key of ['element', 'basePower', 'v', 'damage', 'pairs', 'extra']) {
    reject(t => t.placements[0][key] = 999);
    reject(t => t[key] = 999);
  }
  reject(t => t.action = 'fortify');
  for (const lane of [0, 1, 2, -1, '0', false]) {
    reject(t => t.fortifyLane = lane);
    assert.equal(fortifyAllowed(false, lane).ok, false);
  }
  assert.throws(() => materializeTurn(hand, { ...good, attack: 999 }));
});

test('обе стороны наносят урон одновременно; старые burn/fortify не влияют', () => {
  const baseline = state(), dirty = state();
  dirty.a.burn = [100, 100, 100]; dirty.b.burn = [100, 100, 100];
  const r = resolveRound(baseline, lethal, lethal);
  const r2 = resolveRound(dirty, { ...lethal, fortifyLane: 0 }, { ...lethal, fortifyLane: 1 });
  assert.deepEqual(dirty, baseline);
  assert.deepEqual(r2, r);
  assert.ok(r.events.some(e => e.side === 'a' && e.amount > 0));
  assert.ok(r.events.some(e => e.side === 'b' && e.amount > 0));
  assert.ok(r.events.every(e => !e.burn));
  assert.deepEqual(baseline.a.burn, [0, 0, 0]);
  for (const row of r.report) assert.equal(row.a.info.hit, Math.max(0, row.a.info.a - row.a.info.d));
});

test('нет контрстихий, снижения защиты, лечения и дополнительного урона', () => {
  for (const e of Object.values(ELEMENTS)) {
    const pair = [card(e.suits[0], '2'), card(e.suits[1], '9')];
    assert.equal(attackInfo(fire, pair).a, pairStats(fire).attack);
    assert.equal(attackInfo(pair, fire).d, pairStats(fire).defense);
    const board = state(), a = repeated(pair, pair), r = resolveRound(board, a, a);
    assert.equal(r.events.length, 6);
    assert.ok(r.report.every(row => row.a.burn === 0 && !row.a.info.match));
    for (const side of [board.a, board.b]) {
      assert.equal(side.nexus, 80); assert.deepEqual(side.inner, [18, 18, 18]);
      const p = pairStats(pair);
      assert.deepEqual(side.outer, Array(3).fill(Math.max(0, 12 - Math.max(0, 2 * p.attack - 2 * p.defense))));
    }
  }
});

test('перестановка игроков и порядка placements даёт зеркальный результат (100 раундов)', () => {
  const rng = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const aHand = deal(rng), bHand = deal(rng);
    const a = materializeTurn(aHand, plan(aHand)), b = materializeTurn(bHand, plan(bHand));
    const x = state(); x.a.outer[0] = 0; x.a.inner[0] = 0; x.b.nexus = 19;
    const y = { round: x.round, a: structuredClone(x.b), b: structuredClone(x.a) };
    const rx = resolveRound(x, a, b);
    a.placements.reverse(); b.placements.reverse();
    const ry = resolveRound(y, b, a);
    assert.deepEqual(x.a, y.b); assert.deepEqual(x.b, y.a);
    assert.deepEqual(rx.report.map(r => r.a), ry.report.map(r => r.b));
    assert.deepEqual(rx.report.map(r => r.b), ry.report.map(r => r.a));
  }
});

test('башни без переноса урона, одновременная смерть, победитель и лимит 45', () => {
  const board = state(), weak = repeated(low, low);
  let r = resolveRound(board, lethal, weak);
  assert.deepEqual(board.b.outer, [0, 0, 0]); assert.deepEqual(board.b.inner, [18, 18, 18]);
  assert.equal(board.b.nexus, 80); assert.equal(r.finished, false);
  resolveRound(board, lethal, weak);
  assert.deepEqual(board.b.inner, [0, 0, 0]); assert.equal(board.b.nexus, 80);
  for (let i = 0; i < 3 && !r.finished; i++) r = resolveRound(board, lethal, weak);
  assert.equal(r.winner, 'a');
  const draw = state();
  for (const p of [draw.a, draw.b]) { p.outer.fill(0); p.inner.fill(0); p.nexus = 1; }
  assert.equal(resolveRound(draw, lethal, lethal).winner, 'draw');
  const limit = state(); limit.round = MAX_ROUNDS; limit.a.nexus = 30; limit.b.nexus = 10;
  assert.equal(resolveRound(limit, weak, weak).winner, 'a');
  const tie = state(); tie.round = MAX_ROUNDS;
  assert.equal(resolveRound(tie, weak, weak).winner, 'draw');
});

test('бот использует 12 уникальных карт, интерфейс раскрывает обе пары врага и верный урон', () => {
  const hand = deal(mulberry32(777)), placements = botPlan(hand, newState(), newState());
  const raw = { placements: placements.map(p => ({ lane: p.lane, attack: p.attack.map(c => c.id), defense: p.defense.map(c => c.id) })) };
  assert.equal(validateTurn(hand, raw).ok, true);
  const board = state(), result = resolveRound(board, { placements }, lethal);
  for (const seat of [1, 2]) {
    const reveal = revealAssignments(result.report, seat);
    assert.equal(reveal.length, 6); assert.ok(reveal.every(r => r.cards.length === 4));
    const enemy = seat === 1 ? lethal.placements[0] : placements[0];
    assert.deepEqual(reveal[0].cards, [...enemy.attack, ...enemy.defense]);
  }
  const html = placementHTML(placements.map(p => ({ atk: p.attack, def: p.defense })), false);
  assert.equal((html.match(/class="pair-target"/g) ?? []).length, 6);
  assert.match(html, /Расчёт/); assert.match(html, /⚔/); assert.match(html, /🛡/);
  const view = { latestRoundReport: result };
  assert.match(roundReportHTML(view, 1), new RegExp(`Нанесено: ${result.report[0].a.dealt} HP · 🛡 Получено: ${result.report[0].b.dealt} HP`));
});
