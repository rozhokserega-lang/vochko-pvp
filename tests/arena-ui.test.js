// Тесты арены v20: конфигlayout, состояния башен, совместимость разметки
// с боевой хореографией (#lanes .lane, .side .tower, .nexus-fortress).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUT,
  arenaStage,
  towerBox,
  towerId,
  nexusBox,
  exportLayoutJSON,
} from '../src/ui/arena/arenaLayout.js';
import { battleHTML } from '../src/ui/arena/ArenaScene.js';
import { nexusHTML } from '../src/ui/arena/NexusView.js';
import { cardSlotHTML } from '../src/ui/arena/CardSlot.js';
import { elementAnimHTML, ELEMENT_CLASS } from '../src/ui/arena/ElementEffect.js';
import { towerHighlightClass } from '../src/ui/arena/TowerHighlight.js';

const view = () => ({
  seat: 1,
  status: 'planning',
  board: {
    me: { inner: [18, 18, 18], outer: [12, 12, 12], nexus: 80, shieldPct: 0 },
    opponent: { inner: [18, 18, 18], outer: [12, 12, 12], nexus: 80, shieldPct: 0 },
  },
});
const emptySlots = () => Array.from({ length: 3 }, () => ({ atk: [], def: [] }));

test('layout: 12 башен с уникальными id, 3 ряда платформ, 2 нексуса', () => {
  const towers = LAYOUT.towers;
  assert.equal(towers.length, 12);
  assert.equal(new Set(towers.map((t) => t.id)).size, 12);
  assert.equal(LAYOUT.platforms.rowCy.length, 3);
  for (const side of ['ally', 'enemy']) {
    assert.ok(LAYOUT.platforms.nexus[side].cx > 0);
    assert.equal(LAYOUT.nexus.rows.length, 3);
  }
  // каждая башня стоит на своей платформе: база в пределах эллипса платформы
  for (const t of LAYOUT.towers) {
    const [, team, kind, lane, size] = t.id.split('-');
    const cy = LAYOUT.platforms.rowCy[+lane];
    assert.ok(Math.abs(t.bottom - (cy + LAYOUT.platforms.ry * LAYOUT.tower.bottomK)) < 0.01, t.id);
    assert.ok(t.cx > 0 && t.cx < LAYOUT.platforms.colCx.enemyInner + 400, t.id);
    void team; void kind; void size;
  }
});

test('layout: экспорт JSON валиден и содержит все объекты', () => {
  const parsed = JSON.parse(exportLayoutJSON());
  assert.equal(parsed.towers.length, 12);
  assert.ok(parsed.nexusObjects.ally);
  assert.ok(parsed.nexus.rows.length === 3);
  assert.ok(parsed.elementAnim.fire);
});

test('arenaStage: пороги 50% — целая / повреждённая / фундамент', () => {
  assert.equal(arenaStage(18, 18), 'full');
  assert.equal(arenaStage(10, 18), 'full');   // 55.5% > 50%
  assert.equal(arenaStage(9, 18), 'damaged');  // ровно 50% — не выше порога
  assert.equal(arenaStage(1, 18), 'damaged');
  assert.equal(arenaStage(0, 18), 'ruins');
});

test('towerBox: основание остаётся в одной точке во всех состояниях', () => {
  for (const [team, kind, damagedAxis, ruinsAxis] of [
    ['ally', 'def', 216 / 503, 428 / 898],
    ['enemy', 'atk', 216 / 461, 448 / 940],
  ]) {
    const full = towerBox(team, kind, 0, 'outer', 'full');
    const damaged = towerBox(team, kind, 0, 'outer', 'damaged');
    const ruins = towerBox(team, kind, 0, 'outer', 'ruins');
    assert.equal(full.bottom, damaged.bottom);
    assert.equal(full.bottom, ruins.bottom);
    assert.equal(full.h, damaged.h);
    for (const [box, axis] of [[damaged, damagedAxis], [ruins, ruinsAxis]]) {
      assert.ok(Math.abs(box.cx - box.w / 2 + box.w * axis - full.cx) < 0.01, team);
    }
  }
});

test('battleHTML: 3 линии, 12 башен, 2 нексуса, активные — drop-target', () => {
  const html = battleHTML(view(), emptySlots());
  assert.equal((html.match(/class="lane"/g) || []).length, 3);
  assert.equal((html.match(/class="tower /g) || []).length, 12);
  assert.equal((html.match(/nexus-fortress nexus/g) || []).length, 2);
  // карты кладутся сначала на ближние к центру башни (outer, 12 HP): их 6
  assert.equal((html.match(/tower tower-art[^"]*drop-target/g) || []).length, 6);
  assert.match(html, /tower tower-art ally outer[^"]*drop-target/);
  assert.match(html, /tower tower-art enemy outer[^"]*drop-target/);
  assert.doesNotMatch(html, /tower tower-art ally inner[^"]*drop-target/);
  assert.doesNotMatch(html, /tower tower-art enemy inner[^"]*drop-target/);
  assert.equal((html.match(/nexus-floor locked/g) || []).length, 6);
  // data-атрибуты для обработчиков main.js
  assert.match(html, /data-lane="0" data-kind="def"/);
  assert.match(html, /data-lane="0" data-kind="atk"/);
});

test('battleHTML: ближняя разрушена — принимает дальняя (у Нексуса)', () => {
  const v = view();
  v.board.me.outer = [0, 12, 12];
  const html = battleHTML(v, emptySlots());
  assert.match(html, /ally inner stage-\w+\s+drop-target[\s\S]{0,80}?data-lane="0"/);
  assert.doesNotMatch(html, /ally outer stage-\w+\s+drop-target[\s\S]{0,80}?data-lane="0"/);
});

test('layout: ближние к центру башни (outer) стоят ближе к центру сцены', () => {
  const outer = towerBox('ally', 'def', 1, 'outer', 'full');
  const inner = towerBox('ally', 'def', 1, 'inner', 'full');
  assert.ok(Math.abs(outer.cx - 800) < Math.abs(inner.cx - 800)); // outer ближе к центру
  assert.ok(outer.cx > inner.cx);                                  // для ally — правее
  const eOuter = towerBox('enemy', 'atk', 1, 'outer', 'full');
  const eInner = towerBox('enemy', 'atk', 1, 'inner', 'full');
  assert.ok(Math.abs(eOuter.cx - 800) < Math.abs(eInner.cx - 800));
  assert.ok(eOuter.cx < eInner.cx);                                // для врага — левее
});

test('battleHTML: пробитая линия открывает этаж нексуса и слоты', () => {
  const v = view();
  // верхняя линия врага пробита (обе башни разрушены) — его этаж 0 открыт
  v.board.opponent.outer = [0, 12, 12];
  v.board.opponent.inner = [0, 18, 18];
  const html = battleHTML(v, emptySlots());
  assert.match(html, /nexus-floor open drop-target"\s+data-lane="0" data-kind="atk"/);
});

test('подсказка Нексуса показывает процент входящего урона по числу пробитых линий', () => {
  const board = view().board.opponent;
  board.outer.fill(0);
  for (const [count, percent] of [[0, 0], [1, 40], [2, 70], [3, 100]]) {
    board.inner.fill(0, 0, count);
    const html = nexusHTML(board, emptySlots(), true);
    assert.match(html, new RegExp(`Получает ${percent}% урона`));
    assert.match(html, new RegExp(`Пробито линий: ${count} из 3`));
  }
});

test('в начале HP показывается только у шести ближних башен', () => {
  const html = battleHTML(view(), emptySlots());
  assert.equal((html.match(/class="tower-hp tower-meter tower-crystal /g) || []).length, 6);
  assert.equal((html.match(/class="value"/g) || []).length, 6);
  assert.equal((html.match(/data-vertical="1"/g) || []).length, 6);
  assert.equal((html.match(/class="tower-shield crystal-shield" data-empty/g) || []).length, 6);
  assert.match(html, /class="crystal-fill" data-vertical="1" style="height:100%"/);
  // Числа нужны combatHpSnapshot(), иначе полоска HP не анимируется от удара.
  assert.match(html, /class="value">12 \/ 12</);
  assert.doesNotMatch(html, /class="value">18 \/ 18</);
});

test('при разрушении ближней башни HP появляется у дальней башни той же линии', () => {
  const v = view();
  v.board.me.outer = [0, 12, 12];
  v.board.opponent.outer = [12, 0, 12];
  v.board.me.inner[0] = 9;
  v.board.opponent.inner[1] = 9;
  const html = battleHTML(v, emptySlots());
  assert.equal((html.match(/class="tower-hp tower-meter tower-crystal /g) || []).length, 6);
  assert.equal((html.match(/class="value">9 \/ 18</g) || []).length, 2);
  assert.equal((html.match(/class="value">12 \/ 12</g) || []).length, 4);
  assert.doesNotMatch(html, /class="value">0 \/ 12/);
});

test('предпросмотр: атака не добавляет щит, защита не добавляет атаку', () => {
  const slots = emptySlots();
  slots[0].def = [{ id: 's2', s: '♠', r: '2', v: 2 }, { id: 's3', s: '♠', r: '3', v: 3 }];
  slots[0].atk = [{ id: 'h2', s: '♥', r: '2', v: 2 }, { id: 'h3', s: '♥', r: '3', v: 3 }];
  const html = battleHTML(view(), slots);
  assert.match(html, /aria-label="Щит: 9"/);
  assert.match(html, /class="tower-attack" aria-label="Атака: 8"/);
  assert.doesNotMatch(html, /aria-label="Щит: 6"/);
  assert.equal((html.match(/class="tower-shield crystal-shield" data-empty/g) || []).length, 5);
});

test('индикаторы открытых этажей Нексуса сохранены без кристаллов башен', () => {
  const board = view().board.me;
  board.outer[0] = board.inner[0] = 0;
  const slots = emptySlots();
  slots[0].def = [{ id: 's2', s: '♠', r: '2', v: 2 }, { id: 's3', s: '♠', r: '3', v: 3 }];
  slots[0].atk = [{ id: 'h2', s: '♥', r: '2', v: 2 }, { id: 'h3', s: '♥', r: '3', v: 3 }];
  assert.match(nexusHTML(board, slots, false), /aria-label="Щит: 9"/);
  assert.doesNotMatch(nexusHTML(board, slots, false), /tower-crystal|crystal-shell/);
  const enemy = nexusHTML(board, slots, true);
  assert.match(enemy, /class="tower-attack" aria-label="Атака: 8"/);
  assert.doesNotMatch(enemy, /aria-label="Щит: 6"/);
  assert.match(enemy, /aria-label="Щит: 0"/);
});

test('карты в слотах: пара кладётся в свои слоты, красные — атака (класс red)', () => {
  const html = cardSlotHTML(0, [{ r: '10', s: '♥', id: 'c1' }]);
  assert.match(html, /slot-card red/);
  assert.match(html, /data-slot="0"/);
  assert.match(cardSlotHTML(1, []), /slot-empty/);
});

test('стихии: анимация есть только для известных стихий, для неопределённой — пусто', () => {
  assert.match(elementAnimHTML('🔥'), /element-anim/);
  assert.match(elementAnimHTML('🌫️'), /element-anim/);
  assert.equal(elementAnimHTML('—'), '');
  assert.equal(elementAnimHTML(''), '');
  assert.equal(ELEMENT_CLASS['🔥'], 'fire');
});

test('подсветка: состояния не конфликтуют (выбор > hover, resolving гасит всё)', () => {
  assert.equal(towerHighlightClass({ kind: 'atk', cards: [{}, {}], dead: false }), 'is-sel-atk');
  assert.equal(towerHighlightClass({ kind: 'def', cards: [{}], dead: false }), 'is-sel-def');
  assert.equal(towerHighlightClass({ kind: 'atk', cards: [], dead: false }), 'is-idle');
  assert.equal(towerHighlightClass({ kind: 'def', cards: [], dead: true }), 'is-idle');
  assert.equal(towerHighlightClass({ kind: 'atk', cards: [{}, {}], dead: false, resolving: true }), 'is-resolving');
});

test('нексус: бокс в пределах сцены по X для обеих сторон', () => {
  for (const side of ['ally', 'enemy']) {
    const b = nexusBox(side);
    assert.ok(b.cx - b.w / 2 > -60, side); // лёгкий выход за край, как в референсе
    assert.ok(b.cx + b.w / 2 < 1660, side);
    assert.ok(b.bottom <= 900);
  }
});

test('towerId: симметрия для зеркальных объектов', () => {
  assert.equal(towerId('ally', 'def', 1, 'inner'), 'tower-ally-def-1-inner');
  assert.equal(towerId('enemy', 'atk', 1, 'inner'), 'tower-enemy-atk-1-inner');
});
