import { type, elementName, pairStats } from '../../shared/elements.js';
import { TOWER_ART, NEXUS_IMAGES } from './assets.js';
import { nexusFloorOpen, towerStage } from './combat-logic.js';

// Поле v19: спрайтовые башни (синие/красные, 4 стадии разрушения) и большие
// трёхэтажные Нексусы по краям. Рендер по эталону vochko_pvp_enemy_defense_reveal_v19.html.
const LANE_NAMES = ['ВЕРХ', 'ЦЕНТР', 'НИЗ'];

export const cardHTML = (c) => `<span class="mini ${'♥♦'.includes(c.s) ? 'red' : ''}">${c.r}<span class="suit">${c.s}</span></span>`;

export { meterHTML, animateMeters, METER_LAST } from './meters.js';
import { meterHTML } from './meters.js';

// Стадия разрушения башни для арта: full → worn → critical → ruins (v19).
// Реализация в combat-logic.js (покрывается тестами).

import { ELEMENT_CLASS } from './arena/ElementEffect.js';

export function tower({ hp, max, label, lane, kind, active, slots }) {
  const cards = active ? slots[lane][kind] : [];
  const team = kind === 'def' ? 'ally' : 'enemy';
  const size = max === 12 ? 'outer' : 'inner';
  const stage = towerStage(hp, max);
  const art = TOWER_ART[team + '-' + size + '-' + stage];
  const element = active && hp > 0 && cards.length === 2 ? type(cards) : '';
  const effect = element ? ` element-${ELEMENT_CLASS[element]}` : '';
  const cardsHTML = cards.map(cardHTML).join('');
  return `<div class="tower tower-art ${team} ${size} ${hp <= 0 ? 'dead' : ''}${active && hp > 0 ? ' drop-target' : ''}${effect}" ${active ? `data-lane="${lane}" data-kind="${kind}"` : ''} title="${label}: ${Math.max(0, hp)}/${max} HP">
    ${active ? meterHTML(cards, kind, lane) : ''}
    <div class="tower-visual">
      <img class="tower-sprite" src="${art}" draggable="false" alt="">
      ${active && hp > 0 ? `<div class="tower-card-bay"><div class="tower-cards">${cardsHTML || '<span class="bay-placeholder"></span><span class="bay-placeholder"></span>'}</div></div>` : ''}
    </div>
    <div class="tag">${label}</div>
    <div class="value">${Math.max(0, hp)} / ${max}</div>
    <div class="tinybar"><i style="width:${Math.max(0, (hp / max) * 100)}%"></i></div>
    ${active ? `<div class="element-label">${cards.length === 2 ? elementName(cards) : ''}</div>` : ''}
  </div>`;
}

export function Board(view, mySlots, myHand) {
  // mySlots: локальная раскладка [{atk:[card,card], def:[card,card]}×3] из руки (объекты карт).
  const me = view.board.me, opp = view.board.opponent;
  let html = `<div class="battle-head"><div>◀ МОИ ЛИНИИ</div><div>ЛИНИЯ</div><div>ЛИНИИ СОПЕРНИКА ▶</div></div>`;
  // Нексусы рендерятся внутри #lanes и абсолютом растягиваются на все три линии.
  html += nexusFortress(me, mySlots, false) + nexusFortress(opp, mySlots, true);
  for (let l = 0; l < 3; l++) {
    html += `<div class="lane">
      <div class="side"><div class="tower-group">
        ${tower({ hp: me.inner[l], max: 18, label: 'МОЯ ВНУТРЕННЯЯ', lane: l, kind: 'def', active: me.outer[l] <= 0 && me.inner[l] > 0, slots: mySlots })}
        ${tower({ hp: me.outer[l], max: 12, label: 'МОЯ ВНЕШНЯЯ', lane: l, kind: 'def', active: me.outer[l] > 0, slots: mySlots })}
      </div></div>
      <div class="centerlane"><b>${LANE_NAMES[l]}</b><span>⚔</span><small>${l + 1}</small></div>
      <div class="side enemy"><div class="tower-group">
        ${tower({ hp: opp.outer[l], max: 12, label: 'ВРАГ: ВНЕШ.', lane: l, kind: 'atk', active: opp.outer[l] > 0, slots: mySlots })}
        ${tower({ hp: opp.inner[l], max: 18, label: 'ВРАГ: ВНУТР.', lane: l, kind: 'atk', active: opp.outer[l] <= 0 && opp.inner[l] > 0, slots: mySlots })}
      </div></div>
    </div>`;
  }
  return html;
}

// Большой Нексус v19: три этажа (по линиям), в каждом — два слота карт.
// Карты кладутся на этаж ТОЛЬКО когда линия пробита (дублей с башнями нет).
export function nexusFortress(board, placements, isEnemy) {
  const side = isEnemy ? 'enemy' : 'ally';
  const kind = isEnemy ? 'atk' : 'def';
  const floors = [0, 1, 2].map((lane) => {
    const opened = nexusFloorOpen(board, lane);
    const cards = opened ? (placements[lane][kind] || []) : [];
    const slots = [0, 1].map((idx) => {
      const card = cards[idx];
      return `<span class="nexus-card-slot ${card ? 'filled' : ''}">${card ? `<span class="nexus-inserted-card ${'♥♦'.includes(card.s) ? 'red' : ''}">${card.r}<span>${card.s}</span></span>` : ''}</span>`;
    }).join('');
    const complete = cards.length === 2;
    const stats = pairStats(cards);
    const power = stats ? `⚔ ${stats.attack} · 🛡 ${stats.defense}` : '⚔ 0 · 🛡 0';
    const element = complete ? type(cards) : '';
    const meter = `<div class="nexus-floor-meter ${kind === 'atk' ? 'nexus-attack' : 'nexus-defense'}" aria-label="${kind === 'atk' ? 'Атака' : 'Защита'} Нексуса ${power} ${element}">
      <div class="nexus-floor-meter-caption">${kind === 'atk' ? 'ПАРА 1' : 'ПАРА 2'} <b>${power}</b> <span>${element}</span></div>
      <div class="nexus-floor-meter-track"><i style="width:${complete ? 100 : 0}%"></i></div>
    </div>`;
    return `<div class="nexus-floor ${opened ? 'open drop-target' : 'locked'}"
      data-lane="${lane}" data-kind="${kind}"
      title="${['Верх', 'Центр', 'Низ'][lane]} — ${opened ? 'доступно размещение карт' : 'сначала разрушьте обе башни'}">
      <div class="nexus-floor-cards">${slots}</div>
      ${opened ? meter : ''}
    </div>`;
  }).join('');
  return `<div class="nexus-fortress nexus ${side}" aria-label="${isEnemy ? 'Нексус соперника' : 'Мой Нексус'}">
    <div class="nexus-fortress-image"><img src="${NEXUS_IMAGES[side]}" draggable="false" alt="">
      <div class="nexus-floor-stack">${floors}</div>
    </div>
    <div class="nexus-fortress-stats"><b>${isEnemy ? 'НЕКСУС ВРАГА' : 'МОЙ НЕКСУС'}</b>
      <strong class="hp">${Math.max(0, board.nexus)} / 80</strong>
      <div class="bar"><div class="fill" style="width:${Math.max(0, board.nexus) / 80 * 100}%"></div></div>
      <small>Щит ${board.shieldPct ?? 0}%</small>
    </div>
  </div>`;
}

// Компактная полоса «ПРОТИВ» под полем (#phase обновляется хореографией боя).
export function nexusPhaseBar(view) {
  return `<div class="nexus-phase"><strong>⚔ ПРОТИВ</strong><span id="phase">${view.status === 'planning' ? 'Раскладка' : view.status === 'finished' ? 'Финал' : 'Ожидание'}</span></div>`;
}
