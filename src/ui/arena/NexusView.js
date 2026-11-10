// Нексус арены v20: спрайт с тремя независимыми рядами. В каждом ряду —
// два интерактивных слота карт и круг стихии. Карты кладутся в ряд только
// когда линия пробита (nexusFloorOpen), правила доступа — из combat-logic.
import { type } from '../../../shared/elements.js';
import { combo } from '../../../shared/combos.js';
import { nexusFloorOpen } from '../combat-logic.js';
import { ARENA_ASSETS } from './arena-assets.js';
import { LAYOUT, nexusId } from './arenaLayout.js';
import { cardSlotHTML } from './CardSlot.js';
import { elementAnimHTML } from './ElementEffect.js';

export function nexusHTML(board, placements, isEnemy) {
  const side = isEnemy ? 'enemy' : 'ally';
  const kind = isEnemy ? 'atk' : 'def';
  const floors = LAYOUT.nexus.rows.map((_, lane) => {
    const opened = nexusFloorOpen(board, lane);
    const cards = opened ? (placements[lane][kind] || []) : [];
    const slotsHTML = cardSlotHTML(0, cards) + cardSlotHTML(1, cards);
    const complete = cards.length === 2;
    const power = complete ? combo(cards) : 0;
    const element = complete ? type(cards) : '';
    const meter = `<div class="nexus-floor-meter ${kind === 'atk' ? 'nexus-attack' : 'nexus-defense'}" aria-label="${kind === 'atk' ? 'Атака' : 'Защита'} Нексуса ${power} ${element}">
      <div class="nexus-floor-meter-caption">${kind === 'atk' ? '⚔ АТАКА' : '🛡 ЗАЩИТА'} <b>${power}</b> <span>${element}</span></div>
      <div class="nexus-floor-meter-track"><i style="width:${complete ? 100 : 0}%"></i></div>
    </div>`;
    return `<div class="nexus-floor ${opened ? 'open drop-target' : 'locked'}"
      data-lane="${lane}" data-kind="${kind}" data-row="${lane}"
      title="${['Верх', 'Центр', 'Низ'][lane]} — ${opened ? 'доступно размещение карт' : 'сначала разрушьте обе башни'}">
      <div class="nexus-floor-cards">${slotsHTML}</div>
      <div class="element-circle" data-element="${element}">${elementAnimHTML(element)}</div>
      ${opened ? meter : ''}
    </div>`;
  }).join('');
  return `<div class="nexus-fortress nexus ${side}" data-arena-id="${nexusId(side)}" aria-label="${isEnemy ? 'Нексус соперника' : 'Мой Нексус'}">
    <div class="platform-glow" aria-hidden="true"></div>
    <img class="nexus-sprite" src="${ARENA_ASSETS[side === 'ally' ? 'nexusAlly' : 'nexusEnemy']}" draggable="false" alt="">
    <div class="nexus-floor-stack">${floors}</div>
    <div class="nexus-fortress-stats"><b>${isEnemy ? 'НЕКСУС ВРАГА' : 'МОЙ НЕКСУС'}</b>
      <strong class="hp">${Math.max(0, board.nexus)} / 80</strong>
      <div class="bar"><div class="fill" style="width:${Math.max(0, board.nexus) / 80 * 100}%"></div></div>
      <small>Щит ${board.shieldPct ?? 0}%</small>
    </div>
  </div>`;
}
