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

test('towerBox: башня стоит основанием на платформе, масштаб не скачет между состояниями', () => {
  const full = towerBox('ally', 'def', 0, 'outer', 'full');
  const damaged = towerBox('ally', 'def', 0, 'outer', 'damaged');
  const ruins = towerBox('ally', 'def', 0, 'outer', 'ruins');
  assert.equal(full.bottom, damaged.bottom);          // смена состояния не двигает базу
  assert.equal(full.h, damaged.h);
  assert.ok(Math.abs(full.cx - damaged.cx) < 0.01);
  assert.ok(Math.abs(full.cx - damaged.cx) < 0.01);
  // фундамент лежит НА площадке: низ по её переднему краю (cy + ry)
  assert.equal(ruins.bottom, LAYOUT.platforms.rowCy[0] + LAYOUT.platforms.ry);
  assert.ok(ruins.bottom < full.bottom);              // выше линии основания башен
  assert.ok(ruins.w > full.w);                        // груда камней шире башни
});

test('battleHTML: 3 линии, 12 башен, 2 нексуса, активные — drop-target', () => {
  const html = battleHTML(view(), emptySlots());
  assert.equal((html.match(/class="lane"/g) || []).length, 3);
  assert.equal((html.match(/class="tower /g) || []).length, 12);
  assert.equal((html.match(/nexus-fortress nexus/g) || []).length, 2);
  // карты кладутся сначала на БЛИЖНИЕ к центру башни (inner): их 6 активных
  assert.equal((html.match(/tower tower-art[^"]*drop-target/g) || []).length, 6);
  assert.match(html, /tower tower-art ally inner[^"]*drop-target/);
  assert.match(html, /tower tower-art enemy inner[^"]*drop-target/);
  assert.doesNotMatch(html, /tower tower-art ally outer[^"]*drop-target/);
  // data-атрибуты для обработчиков main.js
  assert.match(html, /data-lane="0" data-kind="def"/);
  assert.match(html, /data-lane="0" data-kind="atk"/);
});

test('battleHTML: внутренняя разрушена — принимает внешняя', () => {
  const v = view();
  v.board.me.inner = [0, 18, 18];
  const html = battleHTML(v, emptySlots());
  assert.match(html, /ally outer stage-\w+\s+drop-target[\s\S]{0,80}?data-lane="0"/);
  assert.doesNotMatch(html, /ally inner stage-\w+\s+drop-target[\s\S]{0,80}?data-lane="0"/);
});

test('battleHTML: пробитая линия открывает этаж нексуса и слоты', () => {
  const v = view();
  // верхняя линия врага пробита (обе башни разрушены) — его этаж 0 открыт
  v.board.opponent.outer = [0, 12, 12];
  v.board.opponent.inner = [0, 18, 18];
  const html = battleHTML(v, emptySlots());
  assert.match(html, /nexus-floor open drop-target"\s+data-lane="0" data-kind="atk"/);
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
