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

export const ARENA_DESIGN = { w: 1600, h: 900 };

// ── Значения по умолчанию (измерены по «Задний фон.png» и референсу) ──
const DEFAULTS = deepFreeze({
  platforms: {
    rowCy: [256, 475, 679],                      // ряды: верх / центр / низ
    // outer (12 HP) — ближняя к центру, ломается первой; inner (18 HP) — ближе к Нексусу
    colCx: { allyOuter: 645, allyInner: 450, enemyInner: 1163, enemyOuter: 959 },
    rx: 64,
    ry: 43,
    nexus: {
      ally: { cx: 158, cy: 468, rx: 82, ry: 100 },
      enemy: { cx: 1442, cy: 468, rx: 82, ry: 100 },
    },
  },
  tower: {
    h: 208,           // высота спрайта башни (целая/повреждённая)
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
      circle: { cx: 47.2, cy: 65, d: 30 },
      glow: { cy: 97, w: 118, h: 46 },
      hp: { cx: 50, cy: -2 },
    },
    artDamaged: {
      slots: [
        { x: 27, y: 36.5, w: 12, h: 14.5 },
        { x: 44.6, y: 36.5, w: 12, h: 14.5 },
      ],
      circle: { cx: 40.5, cy: 65, d: 26 },
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
          { x: 26, y: 30.5, w: 12.5, h: 11.7 },
          { x: 40.5, y: 30.5, w: 12.5, h: 11.7 },
        ],
        circle: { cx: 66.2, cy: 36.2, d: 18.5 },
      },
      {
        slots: [
          { x: 26, y: 46, w: 12.5, h: 11.7 },
          { x: 40.5, y: 46, w: 12.5, h: 11.7 },
        ],
        circle: { cx: 66.2, cy: 52, d: 18.5 },
      },
      {
        slots: [
          { x: 26, y: 62, w: 12.5, h: 11.7 },
          { x: 40.5, y: 62, w: 12.5, h: 11.7 },
        ],
        circle: { cx: 66.2, cy: 67.8, d: 18.5 },
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
        h: state.tower.h,
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

if (!LAYOUT.towers) withDerivedObjects(LAYOUT);

// Платформа башни: {cx, cy, rx, ry, bottom} в design-px.
export function platformOf(team, kind, lane, size) {
  const p = LAYOUT.platforms;
  const cy = p.rowCy[lane];
  const cx = p.colCx[team === 'ally' ? (size === 'outer' ? 'allyOuter' : 'allyInner') : (size === 'outer' ? 'enemyOuter' : 'enemyInner')];
  return { cx, cy, rx: p.rx, ry: p.ry, bottom: cy + p.ry * LAYOUT.tower.bottomK };
}

// Бокс спрайта башни: {cx, bottom, w, h} в design-px (с учётом правок редактора).
export function towerBox(team, kind, lane, size, stage) {
  const id = towerId(team, kind, lane, size);
  const obj = LAYOUT.towers.find((x) => x.id === id) ?? platformOf(team, kind, lane, size);
  const t = LAYOUT.tower;
  const plat = platformOf(team, kind, lane, size);
  // Фундамент (груда камней) лежит на площадке: низ по её переднему краю.
  if (stage === 'ruins') return { cx: obj.cx, bottom: plat.cy + plat.ry, w: obj.ruinsW, h: obj.ruinsH };
  const aspect = stage === 'damaged' ? t.damagedAspect : t.fullAspect;
  return { cx: obj.cx, bottom: obj.bottom, w: obj.h * aspect, h: obj.h };
}

// Бокс спрайта нексуса (с учётом правок редактора).
export function nexusBox(side) {
  const o = LAYOUT.nexusObjects[side];
  return { cx: o.cx, bottom: o.bottom, w: o.h * LAYOUT.nexus.aspect, h: o.h };
}
