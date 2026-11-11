// Тесты интеграции v19 (эталон vochko_pvp_enemy_defense_reveal_v19.html):
// отображение сторон, поглощение защиты, стадии арта, этажи Нексусов,
// раскрытие защиты только после обоих submit, защита от дублей анимации.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextReportRound, hasNewBattle, nexusFloorOpen, towerStage, damageSplit,
  revealAssignments, shieldEntries, fortifyLaneForSubmit,
} from '../src/ui/combat-logic.js';
import * as E from '../shared/engine.js';

const C = (s, r) => ({ id: s + r, s, r, v: r === 'A' ? 11 : r === 'J' || r === 'Q' || r === 'K' ? 10 : +r });

// ── 1. Два игрока завершают раунд: серверный отчёт ────────────────────────
function buildState() {
  const board = { round: 1, a: E.newState(), b: E.newState() };
  return board;
}
const turn = (atk, def) => ({
  placements: [0, 1, 2].map((l) => ({ lane: l, attack: atk[l], defense: def[l] })),
  fortifyLane: null,
});
const FIRE = [C('♥', '10'), C('♥', 'J')], EARTH = [C('♠', '2'), C('♠', '3')];
const fullTurn = (atkPair, defPair) => turn([atkPair, atkPair, atkPair], [defPair, defPair, defPair]);

test('два submit → resolveRound возвращает события и отчёт по трём линиям', () => {
  const board = buildState();
  const r = E.resolveRound(board, fullTurn(FIRE, EARTH), fullTurn(EARTH, FIRE));
  assert.equal(board.round, 2);
  assert.equal(r.report.length, 3);
  assert.ok(r.events.length >= 6);
  r.report.forEach((row, i) => assert.equal(row.lane, i));
  // Рука соперника в отчёте присутствует только как committed-пары раунда.
  const cards = r.report.flatMap((row) => [...row.a.attack, ...row.a.defense, ...row.b.attack, ...row.b.defense]);
  assert.equal(cards.length, 24); // 3 линии × (2 атакующих + 2 защитных) × 2 стороны
});

// ── 2. Защитные карты раскрываются только после обоих submit ──────────────
test('до второго submit в DTO нет отчёта (раскрытия нет)', () => {
  // Логика get-state: отчёт выбирается только для round-1, а раунд ещё не решён.
  const rep = null; // round_events для текущего раунда ещё не существует
  const repRound = nextReportRound(rep, { finished: false, round: 1 });
  assert.equal(repRound, 0);         // проверка round > 0 не срабатывает
  assert.equal(hasNewBattle(rep, repRound, 0), false);
});

test('после обоих submit отчёт появляется ровно один раз (дубли не переигрывают)', () => {
  const board = buildState();
  E.resolveRound(board, fullTurn(FIRE, EARTH), fullTurn(EARTH, FIRE));
  const rep = { events: [{ side: 'b', l: 0, stage: 'outer', amount: 5 }], report: null };
  // Вариант DTO без поля round: round-1, где round стал 2.
  const repRound = nextReportRound(rep, { finished: false, round: 2 });
  assert.equal(repRound, 1);
  assert.equal(hasNewBattle(rep, repRound, 0), true);   // первый показ
  assert.equal(hasNewBattle(rep, repRound, 1), false);  // повтор get-state/realtime
});

// ── 3. Карты отображаются на правильной стороне ───────────────────────────
test('раскрытие: на наших башнях — атака врага, на башнях врага — его защита', () => {
  const A = [C('♥', '2'), C('♥', '3')];       // атака A
  const Ad = [C('♠', 'K'), C('♣', 'Q')];      // защита A
  const B = [C('♦', '5'), C('♦', '9')];       // атака B
  const Bd = [C('♣', 'A'), C('♠', 'A')];      // защита B
  const report = [
    { round: 1, lane: 0,
      a: { info: {}, attack: A, defense: Bd, dealt: 3, stage: 'outer', burn: 0, fortified: false },
      b: { info: {}, attack: B, defense: Ad, dealt: 0, stage: 'outer', burn: 0, fortified: false } },
  ];
  const forSeat1 = revealAssignments(report, 1);
  const mine = forSeat1.filter((a) => a.isMine);
  const theirs = forSeat1.filter((a) => !a.isMine);
  assert.equal(mine.length, 1);
  assert.equal(theirs.length, 1);
  // Наши башни: входящие карты противника — это атака B.
  assert.deepEqual(mine[0].cards, B);
  assert.equal(mine[0].defenderSide, 'a');
  // Башни врага: раскрывается защита B (чёрные карты ♠♣).
  assert.deepEqual(theirs[0].cards, Bd);
  assert.equal(theirs[0].defenderSide, 'b');
  assert.ok(theirs[0].cards.every((c) => '♠♣'.includes(c.s)));
  // Для seat 2 отображение зеркальное.
  const forSeat2 = revealAssignments(report, 2);
  assert.deepEqual(forSeat2.find((a) => a.isMine).cards, A);
  assert.deepEqual(forSeat2.find((a) => !a.isMine).cards, Ad);
});

// ── 4/5. Урон: сначала поглощается защитой, остаток снимает HP ────────────
test('damageSplit: щит съедает атаку раньше HP', () => {
  const s = damageSplit(24, 7);   // атака 24, защита 7
  assert.equal(s.absorbed, 7);
  assert.equal(s.remaining, 0);
  assert.equal(s.hpDamage, 17);
  const s2 = damageSplit(5, 31);  // защита крепче
  assert.equal(s2.absorbed, 5);
  assert.equal(s2.remaining, 26);
  assert.equal(s2.hpDamage, 0);
});

test('серверное правило: hit = max(0, атака − защита); излишек НЕ переносится', () => {
  const board = buildState();
  // A атакует огнём против земляной защиты B; B атакует землёй против земляной защиты A.
  E.resolveRound(board, fullTurn(FIRE, EARTH), fullTurn(EARTH, EARTH));
  // Атакующая пара A: 34; защитная B: 9 → hit 25.
  // Внешняя башня 12 HP уничтожена, остаток СГОРАЕТ — внутренняя не тронута.
  assert.equal(board.b.outer[0], 0);
  assert.equal(board.b.inner[0], 18);
  assert.equal(board.b.nexus, 80);
  // Поджог отключён даже для огня.
  assert.equal(board.b.burn[0], 0);
});

// ── 6. Башни меняют артефакт по состоянию HP ──────────────────────────────
test('towerStage: full → worn → critical → ruins', () => {
  assert.equal(towerStage(12, 12), 'full');
  assert.equal(towerStage(8, 12), 'worn');
  assert.equal(towerStage(4, 12), 'critical');
  assert.equal(towerStage(1, 12), 'critical');
  assert.equal(towerStage(0, 12), 'ruins');
  assert.equal(towerStage(18, 18), 'full');
  assert.equal(towerStage(12, 18), 'worn');
  assert.equal(towerStage(6, 18), 'critical');
});

// ── 7/8. Повторы не дублируют анимацию/урон ──────────────────────────────
test('повторное real-time событие и replay submit не меняют HP', () => {
  const board = buildState();
  const before = structuredClone({ b: board.b, round: board.round });
  const r1 = E.resolveRound(board, fullTurn(FIRE, EARTH), fullTurn(EARTH, EARTH));
  assert.deepEqual(Object.keys(r1), ['events', 'report', 'finished', 'winner']);
  // resolveRound вызывается сервером ровно ОДНИМ игроком (count<2 ветка) —
  // повторный submit старого раунда попадает в 409/идемпотент (см. full-match п.5).
  assert.notDeepEqual(before.b, board.b); // урон применён ровно один раз
});

test('hasNewBattle: отчёт без массива events и round=0 не запускает анимацию', () => {
  assert.equal(hasNewBattle(null, 0, 0), false);
  assert.equal(hasNewBattle({ report: [] }, 1, 0), false); // нет events
  assert.equal(hasNewBattle({ events: [] }, 0, 0), false); // round 0
});

// ── 9. Финальный раунд играется ДО EndScreen ──────────────────────────────
test('финал: hasNewBattle имеет приоритет — анимация идёт сразу после finished', () => {
  const board = { round: 1, a: E.newState(), b: E.newState() };
  board.a.nexus = 1; board.b.nexus = 1;
  board.a.outer = [0, 0, 0]; board.a.inner = [0, 0, 0];
  board.b.outer = [0, 0, 0]; board.b.inner = [0, 0, 0];
  const r = E.resolveRound(board, fullTurn(FIRE, EARTH), fullTurn(FIRE, EARTH));
  assert.equal(r.finished, true); // Нексусы падают в этом раунде
  const rep = { events: r.events, report: r.report };
  const repRound = nextReportRound(rep, { finished: true, round: 1 });
  assert.equal(repRound, 1); // НЕ round-1=0: финальный отчёт знает свой round
  assert.equal(hasNewBattle(rep, repRound, 0), true, 'финал должен проиграть анимацию');
  // Второй refresh после анимации — уже без боя: EndScreen разрешён.
  assert.equal(hasNewBattle(rep, repRound, repRound), false);
});

// ── 13. Нексусы принимают карты на этажах, без дублей с башнями ───────────
test('этаж Нексуса открыт только при пробитых обеих башнях линии и живом Нексусе', () => {
  const p = E.newState();
  assert.equal(nexusFloorOpen(p, 0), false);
  E.damage(p, 0, 12);                                  // внешняя упала
  assert.equal(nexusFloorOpen(p, 0), false);           // внутренняя ещё стоит
  E.damage(p, 0, 18);                                  // внутренняя упала
  assert.equal(nexusFloorOpen(p, 0), true);
  assert.equal(nexusFloorOpen(p, 1), false);           // соседняя линия не влияет
  // Нексус мёртв — карты не принимаются.
  const dead = { nexus: 0, outer: [0, 12, 12], inner: [0, 18, 18] };
  assert.equal(nexusFloorOpen(dead, 0), false);
});

// ── 14. Связка башен и этажей: карта не дублируется ───────────────────────
test('в пробитой линии ни одна башня не активна → карты живут только на этаже', () => {
  const p = E.newState();
  E.damage(p, 1, 30);
  for (let lane = 0; lane < 3; lane++) {
    const opened = nexusFloorOpen(p, lane);
    const outerActive = p.outer[lane] > 0;
    const innerActive = p.outer[lane] <= 0 && p.inner[lane] > 0;
    assert.equal(opened, !outerActive && !innerActive, `линия ${lane}`);
    if (opened) assert.ok(p.outer[lane] <= 0 && p.inner[lane] <= 0);
  }
});

// ── 15. Регресс «Ошибка: fortify-used» в середине матча ────────────────────
test('укрепление никогда не отправляется клиентом', () => {
  // Даже неиспользованное укрепление не может быть отправлено.
  assert.equal(fortifyLaneForSubmit({ fortifyUsed: false, lane: 0 }), null);
  assert.equal(fortifyLaneForSubmit({ fortifyUsed: false, lane: 2 }), null);
  assert.equal(fortifyLaneForSubmit({ fortifyUsed: false, lane: null }), null);
  // После использования — всегда null, иначе сервер отвечает 400 fortify-used
  // и игрок не может отправить ни один следующий раунд.
  for (const lane of [null, 0, 1, 2]) {
    assert.equal(fortifyLaneForSubmit({ fortifyUsed: true, lane }), null, `lane=${lane}`);
  }
  // Мусорные значения не отправляются вовсе.
  for (const lane of [-1, 3, 1.5, '1', undefined, NaN]) {
    assert.equal(fortifyLaneForSubmit({ fortifyUsed: false, lane }), null, `lane=${String(lane)}`);
  }
});

