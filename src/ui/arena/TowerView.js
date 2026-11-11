// Башня арены v20: PNG с тремя состояниями (целая / «пол хп» / фундамент),
// два интерактивных слота карт поверх нарисованных рамок и круг стихии.
// Позиции элементов накладываются в ArenaScene.applyArenaLayout() по конфигу.
import { pairStats, type } from '../../../shared/elements.js';
import { towerHealthHTML } from './TowerHealth.js';
import { ARENA_ASSETS } from './arena-assets.js';
import { LAYOUT, arenaStage, towerId } from './arenaLayout.js';
import { cardSlotHTML } from './CardSlot.js';
import { elementAnimHTML, ELEMENT_CLASS } from './ElementEffect.js';
import { towerHighlightClass } from './TowerHighlight.js';

const ART_KEY = {
  'ally-full': 'towerAllyFull',
  'ally-damaged': 'towerAllyDamaged',
  'ally-ruins': 'towerAllyRuins',
  'enemy-full': 'towerEnemyFull',
  'enemy-damaged': 'towerEnemyDamaged',
  'enemy-ruins': 'towerEnemyRuins',
};

export function towerHTML({ hp, max, label, lane, kind, active, slots }) {
  const cards = active ? slots[lane][kind] : [];
  const team = kind === 'def' ? 'ally' : 'enemy';
  const size = max === 12 ? 'outer' : 'inner';
  const stage = arenaStage(hp, max);
  const alive = hp > 0;
  const power = cards.length === 2 ? pairStats(cards) : null;
  const element = power ? type(cards) : '';
  const elClass = element ? ` element-${ELEMENT_CLASS[element]}` : '';
  const art = ARENA_ASSETS[ART_KEY[`${team}-${stage}`]];
  const hl = towerHighlightClass({ kind, cards, dead: !alive, resolving: false });
  return `<div class="tower tower-art ${team} ${size} stage-${stage} ${alive ? '' : 'dead'}${active && alive ? ' drop-target' : ''}${elClass} ${hl}"
    ${active ? `data-lane="${lane}" data-kind="${kind}"` : ''} data-arena-id="${towerId(team, kind, lane, size)}"
    title="${label}: ${Math.max(0, hp)}/${max} HP">
    <div class="platform-glow" aria-hidden="true"></div>
    <div class="tower-visual">
      <img class="tower-sprite" src="${art}" draggable="false" alt="">
      ${active && alive ? `
      <div class="card-slot-area">
        ${cardSlotHTML(0, cards)}
        ${cardSlotHTML(1, cards)}
      </div>
      <div class="element-circle" data-element="${element}">${elementAnimHTML(element)}</div>` : ''}
    </div>
    ${active && alive ? `
      ${towerHealthHTML(hp, max, power?.defense ?? 0)}
      ${power ? `<span class="tower-attack" aria-label="Атака: ${power.attack}">⚔ ${power.attack}</span>` : ''}
    ` : ''}
  </div>`;
}
