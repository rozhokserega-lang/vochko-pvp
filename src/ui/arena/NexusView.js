// Нексус арены v20: спрайт с тремя независимыми рядами. В каждом ряду —
// два интерактивных слота карт и круг стихии. Карты кладутся в ряд только
// когда линия пробита (nexusFloorOpen), правила доступа — из combat-logic.
import { pairStats, type } from '../../../shared/elements.js';
import { breaches, shieldPct } from '../../../shared/engine.js';
import { nexusFloorOpen } from '../combat-logic.js';
import { combatPowerHTML } from '../meters.js';
import { ARENA_ASSETS } from './arena-assets.js';
import { LAYOUT, nexusId } from './arenaLayout.js';
import { cardSlotHTML } from './CardSlot.js';
import { elementAnimHTML } from './ElementEffect.js';
import { nexusHealthHTML } from './NexusHealth.js';

export function nexusHTML(board, placements, isEnemy) {
  const side = isEnemy ? 'enemy' : 'ally';
  const kind = isEnemy ? 'atk' : 'def';
  const hintId = `nexus-damage-${side}`;
  const floors = LAYOUT.nexus.rows.map((_, lane) => {
    const opened = nexusFloorOpen(board, lane);
    const cards = opened ? (placements[lane][kind] || []) : [];
    const slotsHTML = cardSlotHTML(0, cards) + cardSlotHTML(1, cards);
    const power = cards.length === 2 ? pairStats(cards) : null;
    const element = power ? type(cards) : '';
    return `<div class="nexus-floor ${opened ? 'open drop-target' : 'locked'}"
      data-lane="${lane}" data-kind="${kind}" data-row="${lane}"
      title="${['Верх', 'Центр', 'Низ'][lane]} — ${opened ? 'доступно размещение карт' : 'сначала разрушьте обе башни'}">
      <div class="nexus-floor-cards">${slotsHTML}</div>
      <div class="element-circle" data-element="${element}">${elementAnimHTML(element)}</div>
      ${opened ? combatPowerHTML(kind, power) : ''}
    </div>`;
  }).join('');
  return `<div class="nexus-fortress nexus ${side}" data-arena-id="${nexusId(side)}" role="group" tabindex="0"
    aria-label="${isEnemy ? 'Нексус соперника' : 'Мой Нексус'}" aria-describedby="${hintId}">
    <div class="platform-glow" aria-hidden="true"></div>
    <img class="nexus-sprite" src="${ARENA_ASSETS[side === 'ally' ? 'nexusAlly' : 'nexusEnemy']}" draggable="false" alt="">
    <div class="nexus-floor-stack">${floors}</div>
    <div class="nexus-damage-hint" id="${hintId}" role="tooltip">
      <strong>Получает ${shieldPct(board)}% урона</strong>
      <span>Пробито линий: ${breaches(board)} из ${LAYOUT.nexus.rows.length}</span>
      <span>Для прорыва линии нужно разрушить обе башни.</span>
    </div>
    <div class="nexus-fortress-stats"><b>${isEnemy ? 'НЕКСУС ВРАГА' : 'МОЙ НЕКСУС'}</b>
      ${nexusHealthHTML(board, placements, isEnemy)}
    </div>
  </div>`;
}
