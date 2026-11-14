// Конфигурация арены v20: единое дизайн-пространство 1600×900 и координаты
// всех объектов. Все элементы (фон, башни, нексусы, слоты, круги стихий)
// позиционируются в одной системе координат и масштабируются вместе со сценой.
//
// Позиции спрайтов — design-пиксели сцены (центр X, низ Y). Геометрия
// нарисованных слотов карт и кругов стихий — проценты ОТ контент-bbox
// соответствующего PNG (ассеты кадрируются по контенту в
// scripts/build-arena-assets.mjs), поэтому они переживают любое масштабирование.
//
// ArenaLayoutEditor (?arenaDebug=1) правит конфиг в рантайме, хранит правки
// в localStorage и экспортирует JSON. В обычной игре конфиг читается как есть.

import {INNER_TOWER_META} from './inner-tower-meta.js';
export const ARENA_DESIGN = { w: 1600, h: 760 };
// Дизайн-пространство обрезано до 1600×760 (было 1600×900): из арта фона срезаны
// декоративная кромка стены сверху (40px) и каменная дорожка снизу (100px).
// Фон рисуется в исходном масштабе 1600×900 (высота 118.42% сцены, top −5.263%),
// Y-позиции ниже переведены в новую систему (старое Y − 40).
// Ряды pvp-lobby-redesign ([270,510,750] в системе 900) пересчитаны сюда: −40
// сдвиг обрезки и подъём на 84px, чтобы основание нижней башни (240px, +74)
// поместилось в 760; шаг 240 сохранён — соседние спрайты не перекрываются.

// Ось передней ступени в каждом спрайте. Края обломков асимметричны.
const FOUNDATION_X = {
  full: { ally: 0.5, enemy: 0.5 },
  damaged: { ally: 216 / 503, enemy: 216 / 461 },
  ruins: { ally: 428 / 898, enemy: 448 / 940 },
};
const DAMAGED_WIDTH_RATIO = 461 / 503;

// ── Значения по умолчанию (измерены по «Задний фон.png» и референсу) ──
const DEFAULTS = deepFreeze({
  platforms: {
    rowCy: [186, 426, 666],                      // ряды: верх / центр / низ (система 1600×760)
    // outer (12 HP) — ближняя к центру, ломается первой; inner (18 HP) — ближе к Нексусу.
    // Колонки разнесены шире (аудит v20.1): больше воздуха между башнями и у центра —
    // HP-подписи центральных башен не сцепляются даже на телефонах.
    colCx: { allyOuter: 630, allyInner: 415, enemyInner: 1185, enemyOuter: 970 },
    rx: 64,
    ry: 43,
    nexus: {
      ally: { cx: 158, cy: 428, rx: 82, ry: 100 },
      enemy: { cx: 1442, cy: 428, rx: 82, ry: 100 },
    },
  },
  tower: {
    h: 208,           // высота спрайта башни (целая/повреждённая)
    inner:{
      h:240,ruinsW:182, // +10% только для башен на 18 HP и их обломков
      art:{slots:[{x:32.4,y:38.6,w:15.6,h:11.1},{x:50.6,y:38.6,w:15.6,h:11.1}],circle:{cx:49.3,cy:60.9,d:19.3},glow:{cy:99,w:112,h:35},hp:{cx:50,cy:-2}},
    },
    fullAspect: 0.6157,    // контент-bbox «Башня синяя.png» 431×700
    damagedAspect: 0.7186, // «…пол хп» 503×700 (обвал справа)
    bottomK: 1.72,    // основание: platform.cy + ry × bottomK (по референсу: cy + 74)
    ruinsW: 150,
    ruinsH: 94,
    // Арт в % контент-bbox: два нарисованных слота карт, круг стихии,
    // овал подсветки платформы, позиция HP-индикатора.
    artFull: {
      slots: [
        { x: 31.5, y: 36.5, w: 14, h: 14.5 },
        { x: 52, y: 36.5, w: 14, h: 14.5 },
      ],
      circle: { cx: 50, cy: 64.5, d: 26 },
      glow: { cy: 97, w: 118, h: 46 },
      hp: { cx: 50, cy: -2 },
    },
    artDamaged: {
      slots: [
        { x: 27, y: 36.5, w: 12, h: 14.5 },
        { x: 44.6, y: 36.5, w: 12, h: 14.5 },
      ],
      circle: { cx: 43, cy: 64.4, d: 22.3 },
      glow: { cy: 97, w: 103, h: 40 },
      hp: { cx: 50, cy: -2 },
    },
    artRuins: { slots: [], circle: null, glow: { cy: 100, w: 116, h: 60 }, hp: { cx: 50, cy: -2 } },
    thresholds: { damagedBelow: 0.5 }, // доля HP: >0.5 целая, 0..0.5 повреждённая, 0 фундамент
  },
  nexus: {
    h: 473,           // ширина при aspect 0.669 = 316 → края вровень с границей сцены (как в референсе)
    aspect: 0.669,    // контент-bbox «Синий нексус.png» 642×960
    bottomK: 0.95,    // база: cy платформы + ry × bottomK (по референсу: ~cy + 90)
    cx: { ally: 158, enemy: 1442 },
    // 3 независимых ряда: 2 слота + круг стихии, в % контент-bbox PNG.
    rows: [
      {
        slots: [
          { x: 26.1, y: 30.7, w: 11.6, h: 11.3 },
          { x: 40.9, y: 30.7, w: 11.6, h: 11.3 },
        ],
        circle: { cx: 64.8, cy: 36.3, d: 15.5 },
      },
      {
        slots: [
          { x: 26.1, y: 47.4, w: 11.6, h: 11.3 },
          { x: 40.9, y: 47.4, w: 11.6, h: 11.3 },
        ],
        circle: { cx: 64.8, cy: 53.1, d: 15.5 },
      },
      {
        slots: [
          { x: 26.1, y: 64.3, w: 11.6, h: 11.3 },
          { x: 40.9, y: 64.3, w: 11.6, h: 11.3 },
        ],
        circle: { cx: 64.8, cy: 70, d: 15.5 },
      },
    ],
  },
  // Стихия → ключ готовой 9-кадровой анимации.
  elementAnim: { fire: 'elFire', water: 'elWater', earth: 'elEarth', air: 'elAir', steam: 'elSteam', storm: 'elStorm' },
});

function deepFreeze(o) {
  for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]);
  return o;
}
function deepClone(o) { return structuredClone(o); }
function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

// Живое состояние конфига: мутается редактором, читается рендером сцены.
export const LAYOUT = deepClone(DEFAULTS);

// Производные списки объектов (боксы башен/нексусов) — редактор правит их
// поштучно; после сброса пересобираются из платформ.
function withDerivedObjects(state) {
  const p = state.platforms;
  state.towers = [];
  for (let lane = 0; lane < 3; lane++) {
    for (const [team, kind, size, col] of [
      ['ally', 'def', 'inner', 'allyInner'],
      ['ally', 'def', 'outer', 'allyOuter'],
      ['enemy', 'atk', 'outer', 'enemyOuter'],
      ['enemy', 'atk', 'inner', 'enemyInner'],
    ]) {
      state.towers.push({
        id: towerId(team, kind, lane, size),
        cx: p.colCx[col],
        bottom: p.rowCy[lane] + p.ry * state.tower.bottomK,
        h: size==='inner'?state.tower.inner.h:state.tower.h,
        ruinsW: state.tower.ruinsW,
        ruinsH: state.tower.ruinsH,
      });
    }
  }
  state.nexusObjects = {
    ally: { cx: p.nexus.ally.cx, bottom: p.nexus.ally.cy + p.nexus.ally.ry * state.nexus.bottomK, h: state.nexus.h },
    enemy: { cx: p.nexus.enemy.cx, bottom: p.nexus.enemy.cy + p.nexus.enemy.ry * state.nexus.bottomK, h: state.nexus.h },
  };
  return state;
}

const STORAGE_KEY = 'vochko_arena_layout_v20';

function applyOverrides(target, patch) {
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (isPlainObject(v) && isPlainObject(target[k])) applyOverrides(target[k], v);
    else if (k in target) target[k] = v;
  }
}

/** Загрузить локальные правки редактора (если есть). */
export function loadLayoutOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) applyOverrides(LAYOUT, JSON.parse(raw));
  } catch { /* битый JSON игнорируем */ }
}

/** Сохранить текущий конфиг как правки редактора. */
export function saveLayoutOverrides() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(LAYOUT)); } catch { /* приватный режим */ }
}

/** Сбросить правки редактора. */
export function resetLayoutOverrides() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  for (const k of Object.keys(LAYOUT)) delete LAYOUT[k];
  Object.assign(LAYOUT, deepClone(DEFAULTS));
  withDerivedObjects(LAYOUT);
}

/** Экспорт всего конфига (координаты башен в design-px, арт в % PNG). */
export function exportLayoutJSON() { return JSON.stringify(LAYOUT, null, 2); }

// ── Геометрия ────────────────────────────────────────────────────────────────

// ID арены-объекта (для data-arena-id и редактора).
export const towerId = (team, kind, lane, size) => `tower-${team}-${kind}-${lane}-${size}`;
export const nexusId = (side) => `nexus-${side}`;

// Состояние башни для арта по HP (пороги — в конфиге).
export function arenaStage(hp, max) {
  if (hp <= 0) return 'ruins';
  return hp / max > (LAYOUT.tower.thresholds?.damagedBelow ?? 0.5) ? 'full' : 'damaged';
}

export function towerArt(team, stage, size='outer') {
  if(size==='inner')return stage==='ruins'?{...LAYOUT.tower.artRuins}:LAYOUT.tower.inner.art;
  if (stage === 'ruins') return LAYOUT.tower.artRuins;
  if (stage === 'full') return LAYOUT.tower.artFull;
  const art = LAYOUT.tower.artDamaged;
  if (team !== 'enemy' || !art.circle) return art;
  // Красный спрайт имеет ту же высоту, но меньше обломков справа.
  return {
    ...art,
    slots: art.slots.map((slot) => ({ ...slot, x: slot.x / DAMAGED_WIDTH_RATIO, w: slot.w / DAMAGED_WIDTH_RATIO })),
    circle: { ...art.circle, cx: art.circle.cx / DAMAGED_WIDTH_RATIO, d: art.circle.d / DAMAGED_WIDTH_RATIO },
  };
}

if (!LAYOUT.towers) withDerivedObjects(LAYOUT);

// Платформа башни: {cx, cy, rx, ry, bottom} в design-px.
export function platformOf(team, kind, lane, size) {
  const p = LAYOUT.platforms;
  const cy = p.rowCy[lane];
  const cx = p.colCx[team === 'ally' ? (size === 'outer' ? 'allyOuter' : 'allyInner') : (size === 'outer' ? 'enemyOuter' : 'enemyInner')];
  return { cx, cy, rx: p.rx, ry: p.ry, bottom: cy + p.ry * LAYOUT.tower.bottomK };
}

// Бокс спрайта в design-px. anchorX задаёт ось основания внутри бокса.
export function towerBox(team, kind, lane, size, stage) {
  const id = towerId(team, kind, lane, size);
  const obj = LAYOUT.towers.find((x) => x.id === id) ?? platformOf(team, kind, lane, size);
  const t = LAYOUT.tower;
  if(size==='inner'){
    const destroyed=stage==='ruins',meta=destroyed?INNER_TOWER_META.ruins[team]:INNER_TOWER_META;
    const w=destroyed?t.inner.ruinsW:(obj.h??t.inner.h)*meta.aspect,h=destroyed?w/meta.aspect:obj.h??t.inner.h;
    return {cx:obj.cx+(0.5-meta.anchorX)*w,bottom:obj.bottom,w,h,anchorX:meta.anchorX};
  }
  const aspect = stage === 'damaged' ? t.damagedAspect * (team === 'enemy' ? DAMAGED_WIDTH_RATIO : 1) : t.fullAspect;
  const w = stage === 'ruins' ? obj.ruinsW ?? t.ruinsW : (obj.h ?? t.h) * aspect;
  const h = stage === 'ruins' ? obj.ruinsH ?? t.ruinsH : obj.h ?? t.h;
  const anchorX = FOUNDATION_X[stage][team];
  return { cx: obj.cx + (0.5 - anchorX) * w, bottom: obj.bottom, w, h, anchorX };
}

// Бокс спрайта нексуса (с учётом правок редактора).
export function nexusBox(side) {
  const o = LAYOUT.nexusObjects[side];
  return { cx: o.cx, bottom: o.bottom, w: o.h * LAYOUT.nexus.aspect, h: o.h };
}
