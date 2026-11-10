// Arena Layout Editor — режим разработчика для точной подгонки геометрии
// сцены под готовые PNG. Включение: ?arenaDebug=1 (в обычной игре скрыт,
// в PvP координаты игроков не изменяет — только локальный визуальный слой).
//
// Возможности: сетка координат, зелёные контуры PNG, голубые пунктирные рамки
// слотов, жёлтые пунктирные окружности стихий, крестики центров; выбор объекта,
// перетаскивание указателем, стрелки с шагом 1 design-px, числовые поля;
// тестовый режим (демо-карты, круг стихии, переключение состояний башни);
// «Скопировать JSON» / «Экспорт координат» / «Сбросить изменения».
import { ARENA_DESIGN, LAYOUT, saveLayoutOverrides, resetLayoutOverrides, exportLayoutJSON, arenaStage, towerArt } from './arenaLayout.js';
import { applyArenaLayout } from './ArenaScene.js';
import { ARENA_ASSETS } from './arena-assets.js';

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setByPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((o, k) => o[k], obj);
  if (parent) parent[last] = value;
}

const state = {
  active: false,
  selected: 'tower-ally-def-0-outer', // id объекта
  nexusRow: 0,
  towerState: 'full', // состояние арта, чью геометрию редактируем
  drag: null,
  testMode: false,
};

// ── Определение объекта по элементу сцены ───────────────────────────────────
function objectFromElement(el) {
  const tower = el?.closest('.tower');
  if (tower) return { type: 'tower', id: tower.dataset.arenaId, el: tower };
  const nexus = el?.closest('.nexus-fortress');
  if (nexus) return { type: 'nexus', id: nexus.dataset.arenaId, el: nexus };
  return null;
}

function selectedTowerObj() {
  return LAYOUT.towers.find((t) => t.id === state.selected) ?? null;
}

// Поля выбранного объекта: [{path, label, step}] в design-px или %.
function fieldsForSelection() {
  if (state.selected.startsWith('nexus-')) {
    const side = state.selected.replace('nexus-', '');
    const row = LAYOUT.nexus.rows[state.nexusRow];
    const f = [
      { path: `nexusObjects.${side}.cx`, label: 'X центра' },
      { path: `nexusObjects.${side}.bottom`, label: 'Y низа' },
      { path: `nexusObjects.${side}.h`, label: 'Высота (масштаб)' },
      { path: `nexus.rows.${state.nexusRow}.slots.0.x`, label: 'Слот 1 X, %' },
      { path: `nexus.rows.${state.nexusRow}.slots.0.y`, label: 'Слот 1 Y, %' },
      { path: `nexus.rows.${state.nexusRow}.slots.0.w`, label: 'Слот 1 W, %' },
      { path: `nexus.rows.${state.nexusRow}.slots.0.h`, label: 'Слот 1 H, %' },
      { path: `nexus.rows.${state.nexusRow}.slots.1.x`, label: 'Слот 2 X, %' },
      { path: `nexus.rows.${state.nexusRow}.slots.1.y`, label: 'Слот 2 Y, %' },
      { path: `nexus.rows.${state.nexusRow}.slots.1.w`, label: 'Слот 2 W, %' },
      { path: `nexus.rows.${state.nexusRow}.slots.1.h`, label: 'Слот 2 H, %' },
      { path: `nexus.rows.${state.nexusRow}.circle.cx`, label: 'Круг X, %' },
      { path: `nexus.rows.${state.nexusRow}.circle.cy`, label: 'Круг Y, %' },
      { path: `nexus.rows.${state.nexusRow}.circle.d`, label: 'Круг ⌀, %' },
    ];
    return row ? f : f.slice(0, 3);
  }
  void selectedTowerObj;
  const artKey = state.towerState === 'damaged' ? 'artDamaged' : state.towerState === 'ruins' ? 'artRuins' : 'artFull';
  const idx = indexTower();
  const fields = [
    { path: `towers.${idx}.cx`, label: 'X центра' },
    { path: `towers.${idx}.bottom`, label: 'Y низа' },
    { path: `towers.${idx}.h`, label: 'Высота (масштаб)' },
    { path: `towers.${idx}.ruinsW`, label: 'Фундамент W' },
    { path: `towers.${idx}.ruinsH`, label: 'Фундамент H' },
  ];
  if (state.towerState !== 'ruins') {
    fields.push(
      { path: `tower.${artKey}.slots.0.x`, label: 'Слот 1 X, %' },
      { path: `tower.${artKey}.slots.0.y`, label: 'Слот 1 Y, %' },
      { path: `tower.${artKey}.slots.0.w`, label: 'Слот 1 W, %' },
      { path: `tower.${artKey}.slots.0.h`, label: 'Слот 1 H, %' },
      { path: `tower.${artKey}.slots.1.x`, label: 'Слот 2 X, %' },
      { path: `tower.${artKey}.slots.1.y`, label: 'Слот 2 Y, %' },
      { path: `tower.${artKey}.slots.1.w`, label: 'Слот 2 W, %' },
      { path: `tower.${artKey}.slots.1.h`, label: 'Слот 2 H, %' },
      { path: `tower.${artKey}.circle.cx`, label: 'Круг X, %' },
      { path: `tower.${artKey}.circle.cy`, label: 'Круг Y, %' },
      { path: `tower.${artKey}.circle.d`, label: 'Круг ⌀, %' },
    );
  }
  return fields;
}

function indexTower() {
  return LAYOUT.towers.findIndex((t) => t.id === state.selected);
}

// ── Оверлей-направляющие ────────────────────────────────────────────────────
let overlay = null;

function ensureOverlay() {
  const scene = document.querySelector('#arenaScene');
  if (!scene) return null;
  if (overlay && overlay.isConnected && overlay.parentElement === scene) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'arena-debug-overlay';
  overlay.innerHTML = `
    <div class="arena-debug-grid"></div>
    <div class="arena-debug-shapes"></div>`;
  scene.appendChild(overlay);
  return overlay;
}

function pctOf(v, base) { return +(((v / base) * 100)).toFixed(3) + '%'; }

function renderOverlay() {
  if (!state.active) return;
  const ov = ensureOverlay();
  if (!ov) return;
  const W = ARENA_DESIGN.w, H = ARENA_DESIGN.h;
  const shapes = [];
  const cross = (x, y, color) => shapes.push(
    `<div class="dbg-cross" style="left:${pctOf(x, W)};top:${pctOf(y, H)};--dbg-color:${color}"></div>`);
  const box = (x, y, w, h, color, dashed = true) => shapes.push(
    `<div class="dbg-box" style="left:${pctOf(x, W)};top:${pctOf(y, H)};width:${pctOf(w, W)};height:${pctOf(h, H)};--dbg-color:${color};${dashed ? '--dbg-dash:6px 4px' : ''}"></div>`);
  const circleBox = (cx, cy, dPx, color) => {
    const h = dPx * (LAYOUT.nexus.aspect ? 1 : 1); // окружность: w = d, h по аспекту сцены
    shapes.push(`<div class="dbg-circle" style="left:${pctOf(cx - dPx / 2, W)};top:${pctOf(cy - h / 2, H)};width:${pctOf(dPx, W)};height:${pctOf(h, H)};--dbg-color:${color}"></div>`);
    cross(cx, cy, color);
  };

  // Башни: зелёный контур PNG + голубые слоты + жёлтый круг + крестики.
  for (const t of LAYOUT.towers) {
    const towerEl = document.querySelector(`[data-arena-id="${t.id}"]`);
    const stage = towerEl?.classList.contains('stage-ruins') ? 'ruins' : towerEl?.classList.contains('stage-damaged') ? 'damaged' : 'full';
    const tbox = stage === 'ruins' ? { cx: t.cx, bottom: t.bottom, w: t.ruinsW, h: t.ruinsH } : { cx: t.cx, bottom: t.bottom, w: (stage === 'damaged' ? LAYOUT.tower.damagedAspect : LAYOUT.tower.fullAspect) * t.h, h: t.h };
    const x = tbox.cx - tbox.w / 2, y = tbox.bottom - tbox.h;
    const selectedCls = t.id === state.selected ? ' dbg-selected' : '';
    shapes.push(`<div class="dbg-box dbg-green${selectedCls}" data-dbg-id="${t.id}" style="left:${pctOf(x, W)};top:${pctOf(y, H)};width:${pctOf(tbox.w, W)};height:${pctOf(tbox.h, H)};--dbg-color:#39e75f;--dbg-dash:0 none"></div>`);
    cross(tbox.cx, tbox.bottom, '#39e75f');
    const art = towerArt(t.id.split('-')[1], stage);
    for (const s of art.slots ?? []) {
      box(x + (s.x / 100) * tbox.w, y + (s.y / 100) * tbox.h, (s.w / 100) * tbox.w, (s.h / 100) * tbox.h, '#35d6ff');
    }
    if (art.circle) {
      const d = (art.circle.d / 100) * tbox.w;
      circleBox(x + (art.circle.cx / 100) * tbox.w, y + (art.circle.cy / 100) * tbox.h, d, '#ffd23c');
    }
  }
  // Нексусы: контур + 6 слотов и 3 круга.
  for (const side of ['ally', 'enemy']) {
    const o = LAYOUT.nexusObjects[side];
    const nx = LAYOUT.nexus;
    const w = o.h * nx.aspect, x = o.cx - w / 2, y = o.bottom - o.h;
    const selectedCls = state.selected === `nexus-${side}` ? ' dbg-selected' : '';
    shapes.push(`<div class="dbg-box dbg-green${selectedCls}" data-dbg-id="nexus-${side}" style="left:${pctOf(x, W)};top:${pctOf(y, H)};width:${pctOf(w, W)};height:${pctOf(o.h, H)};--dbg-color:#39e75f;--dbg-dash:0 none"></div>`);
    cross(o.cx, o.bottom, '#39e75f');
    nx.rows.forEach((row, i) => {
      const tag = state.selected === `nexus-${side}` && state.nexusRow === i;
      for (const s of row.slots) {
        box(x + (s.x / 100) * w, y + (s.y / 100) * o.h, (s.w / 100) * w, (s.h / 100) * o.h, tag ? '#7cffd4' : '#35d6ff');
      }
      if (row.circle) {
        const d = (row.circle.d / 100) * w;
        circleBox(x + (row.circle.cx / 100) * w, y + (row.circle.cy / 100) * o.h, d, tag ? '#fff45e' : '#ffd23c');
      }
    });
  }
  ov.querySelector('.arena-debug-shapes').innerHTML = shapes.join('');
}

// ── Панель редактора ────────────────────────────────────────────────────────
let panel = null;

function renderPanel() {
  if (!panel) return;
  const objects = [
    ...LAYOUT.towers.map((t) => ({ id: t.id, label: t.id })),
    { id: 'nexus-ally', label: 'Нексус синий' },
    { id: 'nexus-enemy', label: 'Нексус красный' },
  ];
  const fields = fieldsForSelection().map(({ path, label }) => {
    const v = getByPath(LAYOUT, path);
    return `<label class="dbg-field"><span>${label}</span>
      <input type="number" step="any" data-dbg-path="${path}" value="${v}"></label>`;
  }).join('');
  const towerStateButtons = state.selected.startsWith('tower-') ? `
    <div class="dbg-row">
      ${['full', 'damaged', 'ruins'].map((s) => `<button class="dbg-btn ${state.towerState === s ? 'on' : ''}" data-dbg-state="${s}">${s === 'full' ? 'Целая' : s === 'damaged' ? 'Пол ХП' : 'Фундамент'}</button>`).join('')}
    </div>` : '';
  const rowButtons = state.selected.startsWith('nexus-') ? `
    <div class="dbg-row">
      ${[0, 1, 2].map((r) => `<button class="dbg-btn ${state.nexusRow === r ? 'on' : ''}" data-dbg-row="${r}">Ряд ${r + 1}</button>`).join('')}
    </div>` : '';
  panel.innerHTML = `
    <div class="dbg-title">Arena Layout Editor <span class="dbg-hint">(стрелки — 1px, Shift — 10px)</span></div>
    <label class="dbg-field"><span>Объект</span>
      <select data-dbg-select>${objects.map((o) => `<option value="${o.id}" ${state.selected === o.id ? 'selected' : ''}>${o.label}</option>`).join('')}</select></label>
    ${towerStateButtons}
    ${rowButtons}
    <div class="dbg-grid">${fields}</div>
    <div class="dbg-row">
      <button class="dbg-btn" data-dbg-act="test">${state.testMode ? '⏹ Тест: выкл' : '▶ Тест: демо-карты'}</button>
      <button class="dbg-btn" data-dbg-act="cycle">🔄 Состояние</button>
    </div>
    <div class="dbg-row">
      <button class="dbg-btn" data-dbg-act="copy">📋 Скопировать JSON</button>
      <button class="dbg-btn" data-dbg-act="export">⬇ Экспорт координат</button>
      <button class="dbg-btn warn" data-dbg-act="reset">♻ Сбросить</button>
    </div>
    <div class="dbg-note">Правки живут в localStorage (vochko_arena_layout_v20). Экспорт — в src/ui/arena/arenaLayout.js.</div>`;
}

function refresh() { renderPanel(); renderOverlay(); applyArenaLayout(); }

function applyTestMode() {
  document.querySelectorAll('.arena-scene .tower .demo-cards').forEach((el) => el.remove());
  document.querySelectorAll('.arena-scene .tower.demo-force').forEach((el) => {
    el.classList.remove('demo-force', 'stage-damaged', 'stage-ruins');
    el.classList.add('stage-full');
  });
  if (!state.testMode) { applyArenaLayout(); renderOverlay(); return; }
  const towerEl = document.querySelector(`[data-arena-id="${state.selected}"]`);
  if (!towerEl) return;
  // Демо не трогает состояние матча: карты и анимация только в DOM.
  towerEl.classList.add('demo-force');
  const area = towerEl.querySelector('.card-slot-area');
  if (area) {
    area.querySelectorAll('.slot-card,.slot-empty').forEach((el) => el.remove());
    for (let i = 0; i < 2; i++) {
      const c = document.createElement('span');
      c.className = 'slot-card' + (i ? ' red' : '');
      c.innerHTML = `<i class="rank">${i ? 'K' : '10'}</i><span class="suit">${i ? '♦' : '♥'}</span>`;
      area.querySelectorAll('.card-slot')[i]?.append(c);
    }
  }
  const circle = towerEl.querySelector('.element-circle');
  if (circle) circle.innerHTML = `<img class="element-anim" src="${ARENA_ASSETS.elFire}" alt="" draggable="false">`;
  applyArenaLayout(); renderOverlay();
}

function cycleTowerState() {
  const towerEl = document.querySelector(`[data-arena-id="${state.selected}"]`);
  if (!towerEl) return;
  const order = ['stage-full', 'stage-damaged', 'stage-ruins'];
  const current = order.findIndex((c) => towerEl.classList.contains(c));
  towerEl.classList.remove(...order);
  towerEl.classList.add(order[(current + 1) % order.length]);
  applyArenaLayout(); renderOverlay();
}

function onPanelClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.dbgState) { state.towerState = btn.dataset.dbgState; refresh(); return; }
  if (btn.dataset.dbgRow !== undefined) { state.nexusRow = +btn.dataset.dbgRow; refresh(); return; }
  const act = btn.dataset.dbgAct;
  if (act === 'test') { state.testMode = !state.testMode; applyTestMode(); renderPanel(); return; }
  if (act === 'cycle') { cycleTowerState(); return; }
  if (act === 'copy') { navigator.clipboard?.writeText(exportLayoutJSON()); btn.textContent = '✓ Скопировано'; setTimeout(renderPanel, 1200); return; }
  if (act === 'export') {
    const blob = new Blob([exportLayoutJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'arena-layout.json';
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  if (act === 'reset') { resetLayoutOverrides(); state.testMode = false; applyTestMode(); refresh(); return; }
}

function onPanelInput(e) {
  const input = e.target.closest('input[data-dbg-path]');
  if (!input) return;
  const v = parseFloat(input.value);
  if (Number.isNaN(v)) return;
  setByPath(LAYOUT, input.dataset.dbgPath, v);
  saveLayoutOverrides();
  applyArenaLayout();
  renderOverlay();
}

// ── Перетаскивание объектов указателем ──────────────────────────────────────
function onScenePointerDown(e) {
  if (!state.active) return;
  const hit = e.target.closest('.dbg-box[data-dbg-id], .dbg-circle[data-dbg-id]');
  const id = hit?.dataset?.dbgId ?? objectFromElement(e.target)?.id;
  if (!id) return;
  state.selected = id;
  const scene = document.querySelector('#arenaScene');
  const rect = scene.getBoundingClientRect();
  state.drag = { id, sx: e.clientX, sy: e.clientY, kx: ARENA_DESIGN.w / rect.width, ky: ARENA_DESIGN.h / rect.height, moved: false };
  renderPanel(); renderOverlay();
  e.preventDefault();
}

function onWindowPointerMove(e) {
  if (!state.drag) return;
  const dx = (e.clientX - state.drag.sx) * state.drag.kx;
  const dy = (e.clientY - state.drag.sy) * state.drag.ky;
  if (Math.abs(dx) + Math.abs(dy) < 1 && !state.drag.moved) return;
  state.drag.moved = true;
  nudgeSelected(dx, dy);
  state.drag.sx = e.clientX; state.drag.sy = e.clientY;
}

function nudgeSelected(dx, dy) {
  const id = state.drag?.id ?? state.selected;
  if (id.startsWith('tower-')) {
    const t = LAYOUT.towers.find((x) => x.id === id);
    if (!t) return;
    t.cx += dx; t.bottom += dy;
  } else {
    const side = id.replace('nexus-', '');
    LAYOUT.nexusObjects[side].cx += dx;
    LAYOUT.nexusObjects[side].bottom += dy;
  }
  saveLayoutOverrides();
  applyArenaLayout();
  renderOverlay();
}

function onWindowKeyDown(e) {
  if (!state.active) return;
  if (e.target.closest('input,select,textarea')) return;
  const stepMap = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const step = stepMap[e.key];
  if (!step) return;
  e.preventDefault();
  const k = e.shiftKey ? 10 : 1;
  nudgeSelected(step[0] * k, step[1] * k);
}

// ── Включение/выключение ────────────────────────────────────────────────────
export function isArenaDebugEnabled() {
  return new URLSearchParams(location.search).get('arenaDebug') === '1'
    || localStorage.getItem('vochko_arena_debug') === '1';
}

export function initArenaLayoutEditor() {
  if (!isArenaDebugEnabled() || state.active) return;
  state.active = true;
  localStorage.setItem('vochko_arena_debug', '1');
  panel = document.createElement('div');
  panel.className = 'arena-debug-panel';
  panel.addEventListener('click', onPanelClick);
  panel.addEventListener('input', onPanelInput);
  document.body.appendChild(panel);
  document.addEventListener('pointerdown', onScenePointerDown, true);
  window.addEventListener('pointermove', onWindowPointerMove);
  window.addEventListener('keydown', onWindowKeyDown);
  // Рендер направляющих после каждой перерисовки поля.
  const observer = new MutationObserver(() => { if (state.active) requestAnimationFrame(() => { renderOverlay(); if (state.testMode) applyTestMode(); }); });
  observer.observe(document.getElementById('app'), { childList: true, subtree: false });
  setTimeout(refresh, 60);
}

export function disableArenaLayoutEditor() {
  localStorage.removeItem('vochko_arena_debug');
  state.active = false;
  panel?.remove(); panel = null;
  overlay?.remove(); overlay = null;
}
