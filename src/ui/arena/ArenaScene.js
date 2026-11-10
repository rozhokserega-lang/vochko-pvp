// Сцена арены v20: единое дизайн-пространство (aspect-fit), фон из ресурса,
// 12 башен и 2 Нексуса поверх него. Разметка совместима с боевой хореографией
// (selectors #lanes .lane, .side .tower, .nexus-fortress, .nexus-floor) и
// с обработчиками main.js (.drop-target + data-lane/data-kind).
import { ARENA_DESIGN, LAYOUT, towerBox, nexusBox, towerId, nexusId } from './arenaLayout.js';
import { towerHTML } from './TowerView.js';
import { nexusHTML } from './NexusView.js';
import { ARENA_ASSETS } from './arena-assets.js';

const LANE_NAMES = ['ВЕРХ', 'ЦЕНТР', 'НИЗ'];
const pctOf = (v, base) => +(((v / base) * 100)).toFixed(3) + '%';

// Разметка боевой сцены — тот же контракт, что у старого Board(view, slots, myHand).
// Карты кладутся сначала на ближнюю к центру башню (outer, 12 HP) — она же
// первая принимает урон по правилам; после её разрушения — на дальнюю (18 HP).
export function battleHTML(view, mySlots) {
  const me = view.board.me, opp = view.board.opponent;
  const towers = (l) => `
    <div class="side">
      ${towerHTML({ hp: me.inner[l], max: 18, label: 'МОЯ ДАЛЬНЯЯ', lane: l, kind: 'def', active: me.inner[l] > 0 && me.outer[l] <= 0, slots: mySlots })}
      ${towerHTML({ hp: me.outer[l], max: 12, label: 'МОЯ БЛИЖНЯЯ', lane: l, kind: 'def', active: me.outer[l] > 0, slots: mySlots })}
    </div>
    <div class="centerlane"><b>${LANE_NAMES[l]}</b><small>${l + 1}</small></div>
    <div class="side enemy">
      ${towerHTML({ hp: opp.outer[l], max: 12, label: 'ВРАГ: БЛИЖНЯЯ', lane: l, kind: 'atk', active: opp.outer[l] > 0, slots: mySlots })}
      ${towerHTML({ hp: opp.inner[l], max: 18, label: 'ВРАГ: ДАЛЬНЯЯ', lane: l, kind: 'atk', active: opp.inner[l] > 0 && opp.outer[l] <= 0, slots: mySlots })}
    </div>`;
  return `<div class="arena-scene" id="arenaScene">
    <img class="arena-bg" src="${ARENA_ASSETS.bg}" draggable="false" alt="" aria-hidden="true">
    <div class="battle-head" aria-hidden="true"><div>◀ МОИ ЛИНИИ</div><div>ЛИНИЯ</div><div>ЛИНИИ СОПЕРНИКА ▶</div></div>
    ${nexusHTML(me, mySlots, false)}
    ${nexusHTML(opp, mySlots, true)}
    ${[0, 1, 2].map((l) => `<div class="lane" data-row="${l}">${towers(l)}</div>`).join('')}
  </div>`;
}

// Полоса «⚔ ПРОТИВ / фаза» — как в v19.
export function nexusPhaseBar(view) {
  return `<div class="nexus-phase"><strong>⚔ ПРОТИВ</strong><span id="phase">${view.status === 'planning' ? 'Раскладка' : view.status === 'finished' ? 'Финал' : 'Ожидание'}</span></div>`;
}

/** Наложение геометрии из конфига (design-px → % сцены) на текущий DOM.
 *  Вызывается после каждого рендера и из ArenaLayoutEditor. */
export function applyArenaLayout(root = document) {
  const scene = root.querySelector('#arenaScene');
  if (!scene) return;
  const W = ARENA_DESIGN.w, H = ARENA_DESIGN.h;
  const boxStyle = (el, box) => {
    el.style.left = pctOf(box.cx - box.w / 2, W);
    el.style.top = pctOf(box.bottom - box.h, H);
    el.style.width = pctOf(box.w, W);
    el.style.height = pctOf(box.h, H);
  };
  // ── Линии: бейджи по центру каждого ряда ──
  scene.querySelectorAll('.lane').forEach((lane) => {
    const row = +lane.dataset.row;
    const cy = LAYOUT.platforms.rowCy[row] ?? H / 2;
    const badge = lane.querySelector('.centerlane');
    if (badge) badge.style.top = pctOf(cy, H);
  });
  // ── Башни ──
  scene.querySelectorAll('.tower').forEach((t) => {
    const [, team, kind, lane, size] = t.dataset.arenaId.split('-');
    const stage = t.classList.contains('stage-ruins') ? 'ruins' : t.classList.contains('stage-damaged') ? 'damaged' : 'full';
    const box = towerBox(team, kind, +lane, size, stage);
    boxStyle(t, box);
    const art = stage === 'damaged' ? LAYOUT.tower.artDamaged : stage === 'ruins' ? LAYOUT.tower.artRuins : LAYOUT.tower.artFull;
    // Слоты карт поверх нарисованных рамок.
    t.querySelectorAll('.card-slot').forEach((slot, i) => {
      const s = art.slots[i];
      if (!s) { slot.style.display = 'none'; return; }
      slot.style.display = '';
      slot.style.left = s.x + '%';
      slot.style.top = s.y + '%';
      slot.style.width = s.w + '%';
      slot.style.height = s.h + '%';
    });
    // Круг стихии.
    const circle = t.querySelector('.element-circle');
    if (circle && art.circle) {
      circle.style.display = '';
      circle.style.left = (art.circle.cx - art.circle.d / 2) + '%';
      circle.style.top = (art.circle.cy - art.circle.d * (box.w / box.h) / 2) + '%';
      circle.style.width = art.circle.d + '%';
      circle.style.aspectRatio = '1';
    } else if (circle) circle.style.display = 'none';
    // Овал подсветки платформы.
    const glow = t.querySelector('.platform-glow');
    if (glow && art.glow) {
      glow.style.top = art.glow.cy + '%';
      glow.style.width = art.glow.w + '%';
      glow.style.height = art.glow.h + '%';
    }
    // HP-полоска: сбоку от башни (внешние — к краям сцены, ближние — к центру).
    const hp = t.querySelector('.tower-hp');
    if (hp) {
      hp.style.left = '';
      hp.style.right = '';
      hp.style.bottom = '';
      const toLeft = (team === 'ally') === (size === 'outer');
      hp.classList.toggle('hp-left', toLeft);
      hp.classList.toggle('hp-right', !toLeft);
    }
  });
  // ── Нексусы ──
  scene.querySelectorAll('.nexus-fortress').forEach((n) => {
    const side = n.dataset.arenaId.replace('nexus-', '');
    boxStyle(n, nexusBox(side));
    n.querySelectorAll('.nexus-floor').forEach((floor) => {
      const row = LAYOUT.nexus.rows[+floor.dataset.lane];
      if (!row) return;
      // Полоса ряда = bbox двух слотов и круга (+2%): зона клика/дропа ряда.
      const x0 = Math.min(row.slots[0]?.x ?? 100, row.slots[1]?.x ?? 100, row.circle ? row.circle.cx - row.circle.d / 2 : 100) - 2;
      const x1 = Math.max(row.slots[0]?.x + (row.slots[0]?.w ?? 0) ?? 0, row.slots[1]?.x + (row.slots[1]?.w ?? 0) ?? 0, row.circle ? row.circle.cx + row.circle.d / 2 : 0) + 2;
      const y0 = Math.min(...row.slots.map((s) => s.y), row.circle ? row.circle.cy - 1 : 100) - 1.5;
      const y1 = Math.max(...row.slots.map((s) => s.y + s.h), row.circle ? row.circle.cy + 1 : 0) + 1.5;
      floor.style.left = x0 + '%';
      floor.style.top = y0 + '%';
      floor.style.width = (x1 - x0) + '%';
      floor.style.height = (y1 - y0) + '%';
      const rel = (v, base) => +(((v - base) / (x1 - x0)) * 100).toFixed(3);
      const relY = (v, base) => +(((v - base) / (y1 - y0)) * 100).toFixed(3);
      floor.querySelectorAll('.card-slot').forEach((slot, i) => {
        const s = row.slots[i];
        if (!s) { slot.style.display = 'none'; return; }
        slot.style.display = '';
        slot.style.left = rel(s.x, x0) + '%';
        slot.style.top = relY(s.y, y0) + '%';
        slot.style.width = +((s.w / (x1 - x0)) * 100).toFixed(3) + '%';
        slot.style.height = +((s.h / (y1 - y0)) * 100).toFixed(3) + '%';
      });
      const circle = floor.querySelector('.element-circle');
      if (circle && row.circle) {
        const d = row.circle.d;
        circle.style.display = '';
        circle.style.left = rel(row.circle.cx - d / 2, x0) + '%';
        circle.style.top = relY(row.circle.cy - d * LAYOUT.nexus.aspect / 2, y0) + '%';
        circle.style.width = +((d / (x1 - x0)) * 100).toFixed(3) + '%';
        circle.style.aspectRatio = '1';
      } else if (circle) circle.style.display = 'none';
    });
  });
}
