import { pairStats } from '../../../shared/elements.js';
import { nexusFloorOpen } from '../combat-logic.js';

export function nexusHealthHTML(board, placements, isEnemy) {
  const hp = Math.max(0, board.nexus);
  const lanes = [0, 1, 2].filter(lane => nexusFloorOpen(board, lane));
  const shields = lanes.map(lane => ({ lane, full: isEnemy ? 0 : (pairStats(placements[lane]?.def || [])?.defense || 0) }));
  const total = shields.reduce((sum, entry) => sum + entry.full, 0);
  return `<div class="nexus-health-readout"><strong class="hp">${hp} / 80</strong><span class="nexus-armor" aria-label="Броня: ${total}">🛡 <strong>${total}</strong></span></div>
    <div class="bar nexus-crystal ${hp > 0 && hp <= 20 ? 'critical' : ''}" data-hp="${hp}">
      <div class="nexus-crystal-well"><span class="nexus-crystal-lag" style="width:${hp / 80 * 100}%"></span><div class="fill" style="width:${hp / 80 * 100}%"></div></div>
      <div class="nexus-armor-shell" style="--nexus-shield-slots:${Math.max(1, lanes.length)}">${shields.map(({lane, full}) => `<span class="nexus-armor-segment" data-lane="${lane}" data-full="${full}" data-remaining="${full}"><i style="transform:scaleX(${full ? 1 : 0})"></i></span>`).join('')}</div>
    </div>`;
}

// Each open lane owns an equal part of the envelope. Numbers sum actual
// remaining armor; absorbing a hit still follows the server's lane report.
export function setNexusShield(target, lane, amount, full) {
  const fortress = target?.closest('.nexus-fortress');
  const segment = fortress?.querySelector(`.nexus-armor-segment[data-lane="${lane}"]`);
  if (!segment) return;
  amount = Math.max(0, amount);
  segment.dataset.full = String(full);
  segment.dataset.remaining = String(amount);
  segment.querySelector('i').style.transform = `scaleX(${full > 0 ? Math.min(1, amount / full) : 0})`;
  const total = [...fortress.querySelectorAll('.nexus-armor-segment')].reduce((sum, el) => sum + Number(el.dataset.remaining), 0);
  const label = fortress.querySelector('.nexus-armor');
  label.querySelector('strong').textContent = String(total);
  label.setAttribute('aria-label', `Броня: ${total}`);
}

export function setNexusHealth(target, hp) {
  const meter = target?.querySelector('.nexus-crystal');
  if (!meter) return;
  meter.dataset.hp = String(hp);
  meter.classList.toggle('critical', hp > 0 && hp <= 20);
  meter.querySelector('.nexus-crystal-lag').style.width = hp / 80 * 100 + '%';
}
