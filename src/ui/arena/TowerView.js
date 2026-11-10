// Башня арены v20: PNG с тремя состояниями (целая / «пол хп» / фундамент),
// два интерактивных слота карт поверх нарисованных рамок и круг стихии.
// Позиции элементов накладываются в ArenaScene.applyArenaLayout() по конфигу.
import { attackInfo } from '../../../shared/elements.js';
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
  const power = cards.length === 2 ? attackInfo(kind === 'atk' ? cards : [], kind === 'def' ? cards : []) : null;
  const element = power ? (kind === 'atk' ? power.at : power.dt) : '';
  const shield = power?.d ?? 0;
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
      <div class="tower-hp tower-meter">
        <span class="tower-meter-label">HP <b class="value">${hp} / ${max}</b></span>
        <div class="tower-meter-track"><i data-vertical="1" style="height:${(hp / max) * 100}%"></i></div>
      </div>
      <div class="tower-shield tower-meter" ${shield ? '' : 'data-empty'}>
        <span class="tower-meter-label">Щит <b>${shield}</b></span>
        <div class="tower-meter-track"><i style="height:${shield ? 100 : 0}%"></i></div>
      </div>
      ${kind === 'atk' && power ? `<span class="tower-attack" aria-label="Атака: ${power.a}">⚔ ${power.a}</span>` : ''}
    ` : ''}
  </div>`;
}
